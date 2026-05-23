/*
 * Project note: Main Express API server for Smart Tole.
 * It owns authentication, residents, committees, complaints, notices, dustbins, IoT readings, reports, and email-triggered workflows.
 */
import express from "express";
import cors from "cors";
import crypto from "crypto";
import { garbageReadings } from "./data/dummySensorData.js";
import { query, testDatabaseConnection } from "./config/db.js";
import {
  sendCommitteePasswordResetEmail,
  sendCommitteeAccountAdminEmail,
  sendCommitteeAccountUserEmail,
  sendComplaintCreatedAdminEmail,
  sendComplaintCreatedResidentEmail,
  sendComplaintStatusEmail,
  sendContactAdminEmail,
  sendContactConfirmationEmail,
  sendDustbinAssignmentEmail,
  sendDustbinAlertEmail,
  sendNoticeEmail,
  sendResidentPasswordResetEmail,
  sendResidentProfileUpdatedAdminEmail,
  sendResidentProfileUpdatedResidentEmail
} from "./utils/email.js";
import { comparePassword, hashPassword } from "./utils/passwords.js";

const app = express();
const DEFAULT_PORT = Number(process.env.PORT || 5000);
const ADMIN_TABLE = "committee_admins";
const IOT_DEVICE_OFFLINE_SECONDS = 45;
const PASSWORD_RESET_EXPIRY_MINUTES = 30;

// These schema helpers let the local academic database upgrade itself when the
// project starts, so older XAMPP databases can still run the latest code.
async function ensureColumn(tableName, columnName, definition) {
  const rows = await query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );

  if (rows.length === 0) {
    await query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

async function ensureIndex(tableName, indexName, definition) {
  const rows = await query(
    `SELECT INDEX_NAME
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
     LIMIT 1`,
    [tableName, indexName]
  );

  if (rows.length === 0) {
    await query(`ALTER TABLE ${tableName} ADD ${definition}`);
  }
}

async function ensureForeignKeyReference({
  tableName,
  constraintName,
  columnName,
  referencedTableName,
  referencedColumnName = "admin_id",
  onDelete = "CASCADE"
}) {
  const rows = await query(
    `SELECT REFERENCED_TABLE_NAME AS referencedTableName
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND CONSTRAINT_NAME = ?
       AND REFERENCED_TABLE_NAME IS NOT NULL
     LIMIT 1`,
    [tableName, constraintName]
  );

  const currentReferencedTable = rows[0]?.referencedTableName ?? null;

  if (currentReferencedTable === referencedTableName) {
    return;
  }

  if (currentReferencedTable) {
    await query(`ALTER TABLE ${tableName} DROP FOREIGN KEY ${constraintName}`);
  }

  await query(
    `ALTER TABLE ${tableName}
     ADD CONSTRAINT ${constraintName}
     FOREIGN KEY (${columnName})
     REFERENCES ${referencedTableName} (${referencedColumnName})
     ON DELETE ${onDelete}`
  );
}

async function getComplaintUpdates(complaintId) {
  const updates = await query(
    `SELECT update_id, complaint_id, admin_id, admin_name, status, note, created_at
     FROM complaint_updates
     WHERE complaint_id = ?
     ORDER BY update_id DESC`,
    [complaintId]
  );

  return updates;
}

async function getResidentHistory(residentId) {
  const updates = await query(
    `SELECT history_id, resident_id, admin_name, action_type, details, created_at
     FROM resident_update_history
     WHERE resident_id = ?
     ORDER BY history_id DESC`,
    [residentId]
  );

  return updates;
}

function buildResidentUpdateSummary(previousResident, nextResident) {
  const changedFields = [];

  if (previousResident.name !== nextResident.name) {
    changedFields.push(`name: "${previousResident.name}" -> "${nextResident.name}"`);
  }

  if (previousResident.email !== nextResident.email) {
    changedFields.push(`email: "${previousResident.email}" -> "${nextResident.email}"`);
  }

  if (previousResident.phone !== nextResident.phone) {
    changedFields.push(`phone: "${previousResident.phone}" -> "${nextResident.phone}"`);
  }

  if (previousResident.address !== nextResident.address) {
    changedFields.push(`address: "${previousResident.address}" -> "${nextResident.address}"`);
  }

  if (previousResident.house_no !== nextResident.houseNo) {
    changedFields.push(`house no: "${previousResident.house_no}" -> "${nextResident.houseNo}"`);
  }

  if (Object.prototype.hasOwnProperty.call(nextResident, "zone")) {
    const previousZone = previousResident.zone || "General";
    const nextZone = nextResident.zone || "General";
    if (previousZone !== nextZone) {
      changedFields.push(`zone: "${previousZone}" -> "${nextZone}"`);
    }
  }

  if (Object.prototype.hasOwnProperty.call(nextResident, "accountStatus")) {
    const previousStatus = previousResident.account_status || "Active";
    const nextStatus = nextResident.accountStatus || "Active";
    if (previousStatus !== nextStatus) {
      changedFields.push(`status: "${previousStatus}" -> "${nextStatus}"`);
    }
  }

  if (changedFields.length === 0) {
    return "No resident fields were changed.";
  }

  return changedFields.join(" | ");
}

function getResidentUpdateActionTaken(previousResident, nextResident, updatedByName) {
  const previousStatus = String(previousResident?.account_status || "Active");
  const nextStatus = String(nextResident?.accountStatus || previousStatus);

  if (previousStatus !== nextStatus) {
    return nextStatus === "Inactive"
      ? "Resident account marked inactive"
      : "Resident account reactivated";
  }

  if (updatedByName && previousResident?.user_id) {
    return "Resident information updated";
  }

  return "Resident profile updated";
}

async function getAdminEmailRecipients() {
  const adminRecipients = await query(
    `SELECT admin_id, name, email
     FROM ${ADMIN_TABLE}
     WHERE email IS NOT NULL
       AND email <> ''
       AND COALESCE(account_status, 'Active') = 'Active'
       AND (
         role_type LIKE '%Committee%'
         OR role_type LIKE '%Admin%'
         OR role_type = 'Super Admin'
       )`
  );

  return Array.from(
    adminRecipients.reduce((map, admin) => {
      const email = String(admin.email || "").trim().toLowerCase();
      if (!email || map.has(email)) {
        return map;
      }

      map.set(email, {
        email,
        name: admin.name || "Committee Member"
      });
      return map;
    }, new Map()).values()
  );
}

function getPublicAppBaseUrl(req) {
  const configuredBaseUrl = String(process.env.APP_BASE_URL || "").trim();

  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, "");
  }

  const origin = String(req.headers.origin || "").trim();

  if (origin) {
    return origin.replace(/\/+$/, "");
  }

  const referer = String(req.headers.referer || "").trim();

  if (referer) {
    try {
      return new URL(referer).origin.replace(/\/+$/, "");
    } catch (_error) {
      // Fallback below.
    }
  }

  return "http://localhost:5173";
}

function hashPasswordResetToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function createPasswordResetToken() {
  const rawToken = crypto.randomBytes(32).toString("hex");

  return {
    rawToken,
    tokenHash: hashPasswordResetToken(rawToken)
  };
}

function buildPasswordResetUrl(req, role, token) {
  const baseUrl = getPublicAppBaseUrl(req);
  const path = role === "admin" ? "/admin/reset-password" : "/resident/reset-password";
  return `${baseUrl}${path}?token=${encodeURIComponent(token)}`;
}

async function clearPasswordResetTokens(role, recipientId) {
  await query(
    `UPDATE password_reset_tokens
     SET consumed_at = COALESCE(consumed_at, NOW())
     WHERE recipient_role = ?
       AND recipient_id = ?
       AND consumed_at IS NULL`,
    [role, recipientId]
  );
}

async function savePasswordResetToken({ role, recipientId, email, tokenHash }) {
  await query(
    `INSERT INTO password_reset_tokens (
      recipient_role, recipient_id, recipient_email, token_hash, expires_at
    ) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
    [role, recipientId, email, tokenHash, PASSWORD_RESET_EXPIRY_MINUTES]
  );
}

async function getActivePasswordResetTokenRecord({ role, token }) {
  const rows = await query(
    `SELECT reset_id, recipient_role, recipient_id, recipient_email, expires_at
     FROM password_reset_tokens
     WHERE recipient_role = ?
       AND token_hash = ?
       AND consumed_at IS NULL
       AND expires_at > NOW()
     LIMIT 1`,
    [role, hashPasswordResetToken(token)]
  );

  return rows[0] || null;
}

async function consumePasswordResetToken(resetId) {
  await query(
    "UPDATE password_reset_tokens SET consumed_at = NOW() WHERE reset_id = ?",
    [resetId]
  );
}

function mapCategoryToServiceModule(category) {
  if (["Streetlight", "Electricity"].includes(category)) {
    return { id: "streetlight", label: "Streetlights" };
  }
  if (["Water Supply"].includes(category)) {
    return { id: "water", label: "Water Supply" };
  }
  if (["Drainage", "Road Damage", "Public Property Damage"].includes(category)) {
    return { id: "drainage", label: "Drainage & Roads" };
  }
  if (["Garbage Collection", "Sanitation"].includes(category)) {
    return { id: "garbage", label: "Waste Service" };
  }

  return { id: "safety", label: "Public Safety" };
}

function getSlaDaysForCategory(category, priority) {
  if (["Water Supply", "Security", "Public Safety Alert"].includes(category)) {
    return 1;
  }
  if (["Streetlight", "Electricity", "Garbage Collection", "Sanitation", "Noise Disturbance"].includes(category)) {
    return 2;
  }
  if (["Drainage", "Road Damage", "Public Property Damage"].includes(category)) {
    return 3;
  }

  return priority === "High" ? 1 : priority === "Medium" ? 2 : 3;
}

function getDueDateFromSla(category, priority) {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + getSlaDaysForCategory(category, priority));
  return dueDate.toISOString().slice(0, 10);
}

function getTargetCommitteeRoleForComplaint(category) {
  const normalizedCategory = String(category || "").trim();

  if (["Streetlight", "Electricity", "Other Streetlight Issue"].includes(normalizedCategory)) {
    return "Streetlight Committee";
  }

  if (["Water Supply", "Other Water Supply Issue"].includes(normalizedCategory)) {
    return "Water Supply Committee";
  }

  if (["Drainage", "Road Damage", "Public Property Damage", "Other Drainage Or Road Issue"].includes(normalizedCategory)) {
    return "Infrastructure Committee";
  }

  if (["Garbage Collection", "Sanitation", "Other Waste Or Sanitation Issue"].includes(normalizedCategory)) {
    return "Sanitation Committee";
  }

  if (["Security", "Noise Disturbance", "Public Safety Alert", "Other Public Safety Issue", "Other"].includes(normalizedCategory)) {
    return "Public Safety Committee";
  }

  return "Committee Member";
}

function getComplaintCategoriesForCommitteeRole(roleType) {
  const normalizedRoleType = String(roleType || "").trim();

  if (normalizedRoleType === "Streetlight Committee") {
    return ["Streetlight", "Electricity", "Other Streetlight Issue"];
  }

  if (normalizedRoleType === "Water Supply Committee") {
    return ["Water Supply", "Other Water Supply Issue"];
  }

  if (normalizedRoleType === "Infrastructure Committee") {
    return ["Drainage", "Road Damage", "Public Property Damage", "Other Drainage Or Road Issue"];
  }

  if (normalizedRoleType === "Sanitation Committee") {
    return ["Garbage Collection", "Sanitation", "Other Waste Or Sanitation Issue"];
  }

  if (normalizedRoleType === "Public Safety Committee") {
    return ["Security", "Noise Disturbance", "Public Safety Alert", "Other Public Safety Issue", "Other"];
  }

  return [];
}

function committeeRoleCanAccessExistingDustbins(roleType) {
  return String(roleType || "").trim() === "Sanitation Committee";
}

async function getExistingDustbinCountForCommitteeRole(roleType) {
  if (!committeeRoleCanAccessExistingDustbins(roleType)) {
    return 0;
  }

  const rows = await query("SELECT COUNT(*) AS total FROM garbage_status");
  return Number(rows[0]?.total ?? 0);
}

async function assignExistingComplaintsToCommitteeUser({
  adminId,
  roleType,
  includeSystemAdminAssignments = true,
  takeOverRoleAssignments = false
}) {
  const categories = getComplaintCategoriesForCommitteeRole(roleType);

  if (!adminId || categories.length === 0) {
    return 0;
  }

  if (takeOverRoleAssignments) {
    const categoryPlaceholders = categories.map(() => "?").join(", ");
    const result = await query(
      `UPDATE complaints
       SET assigned_admin_id = ?, assigned_committee = ?
       WHERE status <> 'Resolved'
         AND category IN (${categoryPlaceholders})
         AND (assigned_admin_id IS NULL OR assigned_admin_id <> ?)`,
      [Number(adminId), String(roleType || "").trim(), ...categories, Number(adminId)]
    );

    return Number(result.affectedRows ?? 0);
  }

  const fallbackOwnerRows = await query(
    `SELECT admin_id
     FROM ${ADMIN_TABLE}
     WHERE COALESCE(account_status, 'Active') <> 'Active'
        OR role_type = 'Super Admin'`
  );

  const fallbackOwnerIds = Array.from(
    new Set(
      fallbackOwnerRows
        .map((row) => Number(row.admin_id))
        .filter((value) => Number.isFinite(value) && value > 0)
    )
  );

  const categoryPlaceholders = categories.map(() => "?").join(", ");
  const assignmentConditions = ["assigned_admin_id IS NULL"];
  const params = [Number(adminId), String(roleType || "").trim(), ...categories];

  if (includeSystemAdminAssignments && fallbackOwnerIds.length > 0) {
    assignmentConditions.push(
      `assigned_admin_id IN (${fallbackOwnerIds.map(() => "?").join(", ")})`
    );
    params.push(...fallbackOwnerIds);
  }

  const result = await query(
    `UPDATE complaints
     SET assigned_admin_id = ?, assigned_committee = ?
     WHERE status <> 'Resolved'
       AND category IN (${categoryPlaceholders})
       AND (${assignmentConditions.join(" OR ")})`,
    params
  );

  return Number(result.affectedRows ?? 0);
}

async function findBestComplaintOwnerForRole(roleType, { excludeAdminId = null } = {}) {
  const normalizedRoleType = String(roleType || "").trim();
  const normalizedExcludeAdminId = Number(excludeAdminId);
  const hasExcludedAdminId = Number.isFinite(normalizedExcludeAdminId) && normalizedExcludeAdminId > 0;

  if (normalizedRoleType) {
    const roleOwners = await query(
      `SELECT a.admin_id, a.role_type, COUNT(c.complaint_id) AS open_complaint_count
       FROM ${ADMIN_TABLE} a
       LEFT JOIN complaints c
         ON c.assigned_admin_id = a.admin_id
        AND c.status <> 'Resolved'
       WHERE COALESCE(a.account_status, 'Active') = 'Active'
         AND a.role_type = ?
         ${hasExcludedAdminId ? "AND a.admin_id <> ?" : ""}
       GROUP BY a.admin_id, a.role_type
       ORDER BY open_complaint_count ASC, a.admin_id ASC`,
      hasExcludedAdminId ? [normalizedRoleType, normalizedExcludeAdminId] : [normalizedRoleType]
    );

    if (roleOwners.length > 0) {
      return {
        adminId: Number(roleOwners[0].admin_id),
        roleType: roleOwners[0].role_type || normalizedRoleType
      };
    }
  }

  const systemAdmins = await query(
    `SELECT a.admin_id, a.role_type, COUNT(c.complaint_id) AS open_complaint_count
     FROM ${ADMIN_TABLE} a
     LEFT JOIN complaints c
       ON c.assigned_admin_id = a.admin_id
      AND c.status <> 'Resolved'
     WHERE COALESCE(a.account_status, 'Active') = 'Active'
       AND a.role_type = 'Super Admin'
       ${hasExcludedAdminId ? "AND a.admin_id <> ?" : ""}
     GROUP BY a.admin_id, a.role_type
     ORDER BY open_complaint_count ASC, a.admin_id ASC`,
    hasExcludedAdminId ? [normalizedExcludeAdminId] : []
  );

  if (systemAdmins.length > 0) {
    return {
      adminId: Number(systemAdmins[0].admin_id),
      roleType: systemAdmins[0].role_type || "Super Admin"
    };
  }

  return null;
}

async function reassignExistingComplaintsFromCommitteeUser({
  adminId,
  nextRoleType,
  nextAccountStatus
}) {
  const normalizedAdminId = Number(adminId);
  const normalizedNextRoleType = String(nextRoleType || "").trim();
  const isNextAccountActive = String(nextAccountStatus || "Active").trim() === "Active";

  if (!Number.isFinite(normalizedAdminId) || normalizedAdminId <= 0) {
    return 0;
  }

  const currentComplaints = await query(
    `SELECT complaint_id, category
     FROM complaints
     WHERE assigned_admin_id = ?
       AND status <> 'Resolved'`,
    [normalizedAdminId]
  );

  let reassignedCount = 0;

  for (const complaint of currentComplaints) {
    const targetRoleType = getTargetCommitteeRoleForComplaint(complaint.category);
    const shouldStayWithCurrentUser =
      isNextAccountActive &&
      normalizedNextRoleType &&
      normalizedNextRoleType === targetRoleType;

    if (shouldStayWithCurrentUser) {
      continue;
    }

    const nextOwner = await findBestComplaintOwnerForRole(targetRoleType, {
      excludeAdminId: normalizedAdminId
    });

    const nextAssignedAdminId = Number(nextOwner?.adminId || 0);
    const nextAssignedCommittee = String(nextOwner?.roleType || targetRoleType || "").trim() || null;

    if (nextAssignedAdminId === normalizedAdminId) {
      continue;
    }

    const result = await query(
      `UPDATE complaints
       SET assigned_admin_id = ?, assigned_committee = ?
       WHERE complaint_id = ?`,
      [nextAssignedAdminId || null, nextAssignedCommittee, complaint.complaint_id]
    );

    reassignedCount += Number(result.affectedRows ?? 0);
  }

  return reassignedCount;
}

async function getAutoComplaintAssignment(category) {
  const targetCommitteeRole = getTargetCommitteeRoleForComplaint(category);
  const admins = await query(
    `SELECT a.admin_id, a.name, a.role_type, COUNT(c.complaint_id) AS open_complaint_count
     FROM ${ADMIN_TABLE}
     a
     LEFT JOIN complaints c
       ON c.assigned_admin_id = a.admin_id
      AND c.status <> 'Resolved'
     WHERE COALESCE(a.account_status, 'Active') = 'Active'
       AND a.role_type = ?
     GROUP BY a.admin_id, a.name, a.role_type
     ORDER BY open_complaint_count ASC, a.admin_id ASC`,
    [targetCommitteeRole]
  );

  const assignedAdmin = admins[0] ?? null;

  return {
    assignedAdminId: assignedAdmin?.admin_id ?? null,
    assignedAdminName: assignedAdmin?.name ?? "",
    assignedCommittee: targetCommitteeRole || "Committee Member"
  };
}

function normalizeDateOnly(value) {
  if (!value) {
    return "";
  }

  return new Date(value).toISOString().slice(0, 10);
}

function normalizeDeviceId(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhoneLookupValue(value) {
  return String(value || "").replace(/\D/g, "");
}

async function attachDeviceToDustbin(sensorId, { zone, locationLabel, deviceStatus, deviceId }) {
  const normalizedSensorId = String(sensorId || "").trim();
  const normalizedDeviceId = normalizeDeviceId(deviceId);

  if (normalizedDeviceId) {
    const conflictingRows = await query(
      "SELECT sensor_id FROM dustbin_devices WHERE device_id = ? AND sensor_id <> ?",
      [normalizedDeviceId, normalizedSensorId]
    );

    for (const row of conflictingRows) {
      const conflictingSensorId = String(row.sensor_id || "").trim();

      if (!conflictingSensorId) {
        await query(
          "DELETE FROM dustbin_devices WHERE sensor_id = ?",
          [row.sensor_id]
        );
        continue;
      }

      await query(
        "UPDATE dustbin_devices SET device_id = NULL WHERE sensor_id = ?",
        [conflictingSensorId]
      );
    }
  }

  await query(
    `INSERT INTO dustbin_devices (sensor_id, zone, location_label, device_status, device_id)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       zone = VALUES(zone),
       location_label = VALUES(location_label),
       device_status = VALUES(device_status),
       device_id = VALUES(device_id)`,
    [normalizedSensorId, zone, locationLabel, deviceStatus, normalizedDeviceId || null]
  );
}

async function recordIoTDeviceActivity({
  deviceId,
  ipAddress = null,
  linkedSensorId = null,
  contactType = "heartbeat",
  createIfMissing = true
}) {
  const normalizedDeviceId = normalizeDeviceId(deviceId);

  if (!normalizedDeviceId) {
    return;
  }

  if (!createIfMissing) {
    await query(
      `UPDATE iot_device_registry
       SET last_ip_address = COALESCE(?, last_ip_address),
           linked_sensor_id = COALESCE(?, linked_sensor_id),
           last_contact_type = ?,
           last_seen_at = CURRENT_TIMESTAMP
       WHERE device_id = ?`,
      [ipAddress, linkedSensorId || null, contactType, normalizedDeviceId]
    );
    return;
  }

  await query(
    `INSERT INTO iot_device_registry (
      device_id, last_ip_address, linked_sensor_id, last_contact_type
    ) VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      last_ip_address = VALUES(last_ip_address),
      linked_sensor_id = COALESCE(VALUES(linked_sensor_id), linked_sensor_id),
      last_contact_type = VALUES(last_contact_type),
      last_seen_at = CURRENT_TIMESTAMP`,
    [normalizedDeviceId, ipAddress, linkedSensorId || null, contactType]
  );
}

function buildSensorPrefix(resident) {
  const rawPrefix = String(resident?.house_no || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return rawPrefix || `R${resident?.user_id || "00"}`;
}

async function generateSensorIdForResident(assignedUserId, excludeStatusId = null) {
  const residents = await query(
    "SELECT user_id, house_no FROM users WHERE user_id = ? LIMIT 1",
    [assignedUserId]
  );

  if (residents.length === 0) {
    return "";
  }

  const resident = residents[0];
  const countRows = await query(
    `SELECT COUNT(*) AS total
     FROM garbage_status
     WHERE assigned_user_id = ?
       ${excludeStatusId ? "AND status_id <> ?" : ""}`,
    excludeStatusId ? [assignedUserId, excludeStatusId] : [assignedUserId]
  );

  const prefix = buildSensorPrefix(resident);
  let sequence = Number(countRows[0]?.total ?? 0) + 1;

  while (sequence < 1000) {
    const candidate = `${prefix}-${String(sequence).padStart(2, "0")}`;
    const duplicates = await query(
      `SELECT status_id
       FROM garbage_status
       WHERE sensor_id = ?
         ${excludeStatusId ? "AND status_id <> ?" : ""}
       LIMIT 1`,
      excludeStatusId ? [candidate, excludeStatusId] : [candidate]
    );

    if (duplicates.length === 0) {
      return candidate;
    }

    sequence += 1;
  }

  return `${prefix}-${Date.now()}`;
}

async function runAutoEscalation() {
  const result = await query(
    `UPDATE complaints
     SET escalated = 1
     WHERE status <> 'Resolved'
       AND due_date IS NOT NULL
       AND due_date < CURDATE()
       AND escalated = 0`
  );

  return result.affectedRows ?? 0;
}

async function sendEmailOnce({ eventKey, eventType, recipientEmail, send }) {
  const result = await query(
    "INSERT IGNORE INTO email_notification_log (event_key, event_type, recipient_email) VALUES (?, ?, ?)",
    [eventKey, eventType, recipientEmail]
  );

  if (result.affectedRows === 0) {
    console.log(`[email:deduped] ${eventKey}`);
    return { skipped: true };
  }

  await send();
  return { skipped: false };
}

async function createNotification({
  recipientRole,
  recipientUserId = null,
  recipientAdminId = null,
  type,
  title,
  message,
  linkPath
}) {
  await query(
    `INSERT INTO notifications (
      recipient_role, recipient_user_id, recipient_admin_id, notification_type, title, message, link_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      recipientRole,
      recipientUserId,
      recipientAdminId,
      type,
      title,
      message,
      linkPath || null
    ]
  );
}

async function createBulkNotifications(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return;
  }

  await Promise.all(items.map((item) => createNotification(item)));
}

async function ensureDefaultAdminAccount() {
  await query(
    `CREATE TABLE IF NOT EXISTS ${ADMIN_TABLE} (
      admin_id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(120) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NULL,
      role_type VARCHAR(100) DEFAULT 'Super Admin',
      account_status VARCHAR(20) DEFAULT 'Active',
      phone VARCHAR(50) NULL,
      address VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  );

  const seedAdmins = [
    {
      username: "reactadmin",
      password: "admin123",
      name: "React Admin",
      email: "reactadmin@smarttole.local",
      roleType: "Super Admin"
    },
    {
      username: "backupadmin",
      password: "backup123",
      name: "Backup Admin",
      email: "backupadmin@smarttole.local",
      roleType: "Super Admin"
    }
  ];

  for (const seedAdmin of seedAdmins) {
    const existingAdmin = await query(
      `SELECT admin_id
       FROM ${ADMIN_TABLE}
       WHERE username = ?
       LIMIT 1`,
      [seedAdmin.username]
    );

    if (existingAdmin.length === 0) {
      const hashedPassword = await hashPassword(seedAdmin.password);

      await query(
        `INSERT INTO ${ADMIN_TABLE} (username, password, name, email, role_type)
         VALUES (?, ?, ?, ?, ?)`,
        [seedAdmin.username, hashedPassword, seedAdmin.name, seedAdmin.email, seedAdmin.roleType]
      );
    }
  }
}

function getNotificationWhereClause(role, userId, adminId) {
  if (role === "resident" && userId) {
    return {
      clause: "recipient_role = 'resident' AND recipient_user_id = ?",
      values: [userId]
    };
  }

  if (role === "admin" && adminId) {
    return {
      clause: "recipient_role = 'admin' AND recipient_admin_id = ?",
      values: [adminId]
    };
  }

  throw new Error("Valid notification recipient is required");
}

function getGarbageLevelStatus(level) {
  if (Number(level) <= 0) {
    return "Empty";
  }

  if (level >= 80) {
    return "Full";
  }

  if (level >= 50) {
    return "Warning";
  }

  return "Normal";
}

function isGarbageAlertStatus(status) {
  return status === "Warning" || status === "Full";
}

function getDeviceConnectivityStatus({ deviceId, lastSeenAt, deviceStatus }) {
  const normalizedDeviceId = String(deviceId || "").trim();
  const normalizedDeviceStatus = String(deviceStatus || "").trim().toLowerCase();

  if (!normalizedDeviceId) {
    return "Device Not Assigned";
  }

  if (normalizedDeviceStatus === "disconnected") {
    return "Disconnected";
  }

  if (!lastSeenAt) {
    return "Disconnected";
  }

  const lastSeenDate = new Date(lastSeenAt);

  if (Number.isNaN(lastSeenDate.getTime())) {
    return "Disconnected";
  }

  return Date.now() - lastSeenDate.getTime() > IOT_DEVICE_OFFLINE_SECONDS * 1000 ? "Disconnected" : "Connected";
}

function normalizeGarbageLevel(value) {
  const parsed = Number(value);

  if (Number.isNaN(parsed)) {
    return Number.NaN;
  }

  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function getDustbinLink(sensorId, role = "resident") {
  const encodedId = encodeURIComponent(String(sensorId));

  if (role === "admin") {
    return `/admin/garbage-monitoring?bin=${encodedId}`;
  }

  return `/resident/garbage-status?bin=${encodedId}`;
}

function isIoTDeviceAuthorized(req) {
  const configuredKey = String(process.env.IOT_DEVICE_API_KEY || "").trim();

  if (!configuredKey) {
    return true;
  }

  const requestKey = String(
    req.headers["x-device-key"] ||
    req.headers["x-api-key"] ||
    req.body?.apiKey ||
    ""
  ).trim();

  return requestKey === configuredKey;
}

async function upsertDustbinDeviceMetadata(sensorId, { zone, locationLabel, deviceStatus, deviceId }) {
  await attachDeviceToDustbin(sensorId, {
    zone,
    locationLabel,
    deviceStatus,
    deviceId
  });
}

async function createAdminDustbinNotifications({ sensorId, level, currentStatus, previousStatus }) {
  const admins = await query(
    `SELECT admin_id
     FROM ${ADMIN_TABLE}
     WHERE role_type LIKE '%Committee%'
        OR role_type LIKE '%Admin%'
        OR role_type = 'Super Admin'`
  );

  if (!admins.length) {
    return;
  }

  const statusChanged = previousStatus && previousStatus !== currentStatus;
  const title =
    currentStatus === "Normal" || currentStatus === "Empty"
      ? `Dustbin ${sensorId} is now ${currentStatus}`
      : `Dustbin ${sensorId} is ${currentStatus}`;
  const message = statusChanged
    ? `Dustbin ${sensorId} changed from ${previousStatus} to ${currentStatus} at ${level}% fill level.`
    : `Dustbin ${sensorId} reported ${currentStatus} at ${level}% fill level.`;

  await createBulkNotifications(
    admins.map((admin) => ({
      recipientRole: "admin",
      recipientAdminId: admin.admin_id,
      type: "dustbin_status_change",
      title,
      message,
      linkPath: getDustbinLink(sensorId, "admin")
    }))
  );
}

async function handleDustbinStatusTransition({
  sensorId,
  level,
  previousLevel,
  assignedUserId,
  residentName,
  residentEmail
}) {
  const previousStatus = getGarbageLevelStatus(previousLevel);
  const currentStatus = getGarbageLevelStatus(level);

  if (previousStatus === currentStatus) {
    return;
  }

  await createNotification({
    recipientRole: "resident",
    recipientUserId: assignedUserId,
    type: "dustbin_status_change",
    title: `Dustbin ${sensorId} is now ${currentStatus}`,
    message: `Dustbin ${sensorId} changed from ${previousStatus} to ${currentStatus} at ${level}% fill level.`,
    linkPath: getDustbinLink(sensorId)
  });

  if (residentEmail && isGarbageAlertStatus(currentStatus)) {
    await sendDustbinAlertEmail({
      to: residentEmail,
      residentName: residentName || "Resident",
      binId: String(sensorId),
      status: currentStatus,
      fillPercentage: level
    });
  }

  await createAdminDustbinNotifications({
    sensorId,
    level,
    currentStatus,
    previousStatus
  });
}

function getPriorityRank(priority) {
  if (priority === "High") {
    return 3;
  }

  if (priority === "Medium") {
    return 2;
  }

  return 1;
}

function escapeCsvValue(value) {
  const normalized = String(value ?? "");
  if (normalized.includes(",") || normalized.includes("\"") || normalized.includes("\n")) {
    return `"${normalized.replace(/"/g, "\"\"")}"`;
  }

  return normalized;
}

function toCsv(rows) {
  if (!rows.length) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(","))
  ];

  return lines.join("\n");
}

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/", (_req, res) => {
  res.json({
    message: "Smart Digital Tole API is running"
  });
});

app.get("/api/notifications", async (req, res) => {
  const role = String(req.query.role || "").trim();
  const userId = req.query.userId ? Number(req.query.userId) : null;
  const adminId = req.query.adminId ? Number(req.query.adminId) : null;
  const limit = Math.min(Math.max(Number(req.query.limit || 12), 1), 50);

  try {
    const { clause, values } = getNotificationWhereClause(role, userId, adminId);
    const notifications = await query(
      `SELECT notification_id, notification_type, title, message, link_path, is_read, created_at
       FROM notifications
       WHERE ${clause}
       ORDER BY notification_id DESC
       LIMIT ${limit}`,
      values
    );

    const unreadCountRows = await query(
      `SELECT COUNT(*) AS unread_total
       FROM notifications
       WHERE ${clause}
         AND is_read = 0`,
      values
    );

    return res.json({
      items: notifications.map((item) => ({
        id: item.notification_id,
        type: item.notification_type,
        title: item.title,
        message: item.message,
        linkPath: item.link_path,
        isRead: Boolean(item.is_read),
        createdAt: item.created_at
      })),
      unreadCount: unreadCountRows[0]?.unread_total ?? 0
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch notifications",
      error: error.message
    });
  }
});

app.patch("/api/notifications/:notificationId/read", async (req, res) => {
  try {
    const result = await query(
      "UPDATE notifications SET is_read = 1 WHERE notification_id = ?",
      [req.params.notificationId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Notification not found"
      });
    }

    return res.json({
      message: "Notification marked as read"
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update notification",
      error: error.message
    });
  }
});

app.patch("/api/notifications/read-all", async (req, res) => {
  const { role, userId, adminId } = req.body;

  try {
    const { clause, values } = getNotificationWhereClause(
      String(role || "").trim(),
      userId ? Number(userId) : null,
      adminId ? Number(adminId) : null
    );

    await query(
      `UPDATE notifications
       SET is_read = 1
       WHERE ${clause}
         AND is_read = 0`,
      values
    );

    return res.json({
      message: "All notifications marked as read"
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to mark all notifications as read",
      error: error.message
    });
  }
});

app.post("/api/auth/resident/register", async (req, res) => {
  const { fullName, email, phone, address, houseNo, zone, password } = req.body;

  if (!fullName || !email || !phone || !address || !houseNo || !password) {
    return res.status(400).json({
      message: "All fields are required"
    });
  }

  try {
    const existingResidents = await query(
      "SELECT user_id FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    if (existingResidents.length > 0) {
      return res.status(409).json({
        message: "A resident account with this email already exists"
      });
    }

    const hashedPassword = await hashPassword(password);

    const result = await query(
      "INSERT INTO users (name, phone, email, address, house_no, zone, password, account_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [fullName, phone, email, address, houseNo, zone || "General", hashedPassword, "Active"]
    );

    return res.status(201).json({
      message: "Resident registered successfully",
      user: {
        id: result.insertId,
        fullName,
        email,
        phone,
        address,
        houseNo,
        zone: zone || "General",
        role: "resident"
      }
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to register resident",
      error: error.message
    });
  }
});

app.post("/api/auth/resident/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const residents = await query(
      "SELECT user_id, name, email, phone, address, house_no, zone, password, account_status FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    if (residents.length === 0) {
      return res.status(401).json({
        message: "Invalid resident email or password"
      });
    }

    const resident = residents[0];

    if (String(resident.account_status || "Active") === "Inactive") {
      return res.status(403).json({
        message: "This resident account is inactive. Please contact the admin team."
      });
    }

    const isMatch = await comparePassword(password, resident.password);

    if (!isMatch) {
      return res.status(401).json({
        message: "Invalid resident email or password"
      });
    }

    return res.json({
      message: "Resident login successful",
      user: {
        id: resident.user_id,
        fullName: resident.name,
        email: resident.email,
        phone: resident.phone,
        address: resident.address,
        houseNo: resident.house_no,
        zone: resident.zone || "General",
        accountStatus: resident.account_status || "Active",
        role: "resident"
      }
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to login resident",
      error: error.message
    });
  }
});

app.post("/api/auth/admin/login", async (req, res) => {
  const { username, password } = req.body;

  try {
      const admins = await query(
        `SELECT admin_id, username, password, name, email, role_type, account_status FROM ${ADMIN_TABLE} WHERE username = ? OR email = ? LIMIT 1`,
        [username, username]
      );

    if (admins.length === 0) {
      return res.status(401).json({
        message: "Invalid admin username or password"
      });
    }

    const admin = admins[0];

    if (String(admin.account_status || "Active") === "Inactive") {
      return res.status(403).json({
        message: "This committee account is inactive. Please contact the admin team."
      });
    }

    const isMatch = await comparePassword(password, admin.password);

    if (!isMatch) {
      return res.status(401).json({
        message: "Invalid admin username or password"
      });
    }

      return res.json({
        message: "Admin login successful",
        user: {
          id: admin.admin_id,
          username: admin.username,
          name: admin.name,
          email: admin.email || "",
          roleType: admin.role_type || "Super Admin",
          accountStatus: admin.account_status || "Active",
          role: "admin"
        }
      });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to login admin",
      error: error.message
    });
  }
});

app.post("/api/auth/resident/forgot-password", async (req, res) => {
  const identifier = String(req.body.email || "").trim();
  const normalizedEmail = identifier.toLowerCase();
  const normalizedPhone = normalizePhoneLookupValue(identifier);

  if (!identifier) {
    return res.status(400).json({
      message: "Registered email or phone number is required"
    });
  }

  try {
    const residents = await query(
      `SELECT user_id, name, email
       FROM users
       WHERE LOWER(email) = ?
          OR REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '(', '') = ?
       LIMIT 1`,
      [normalizedEmail, normalizedPhone]
    );

    if (residents.length === 0) {
      return res.json({
        message: "If the email is registered, a password reset link has been sent."
      });
    }

    const resident = residents[0];
    const { rawToken, tokenHash } = createPasswordResetToken();

    await clearPasswordResetTokens("resident", resident.user_id);
    await savePasswordResetToken({
      role: "resident",
      recipientId: resident.user_id,
      email: resident.email,
      tokenHash
    });

    await sendResidentPasswordResetEmail({
      to: resident.email,
      residentName: resident.name || "Resident",
      resetUrl: buildPasswordResetUrl(req, "resident", rawToken),
      expiresInMinutes: PASSWORD_RESET_EXPIRY_MINUTES
    });

    return res.json({
      message: "If the email is registered, a password reset link has been sent."
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to send resident password reset email",
      error: error.message
    });
  }
});

app.post("/api/auth/admin/forgot-password", async (req, res) => {
  const username = String(req.body.username || "").trim();
  const normalizedPhone = normalizePhoneLookupValue(username);

  if (!username) {
    return res.status(400).json({
      message: "Username, email, or phone number is required"
    });
  }

  try {
    const admins = await query(
      `SELECT admin_id, username, name, email, role_type
       FROM ${ADMIN_TABLE}
       WHERE username = ? OR email = ?
          OR REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '(', '') = ?
       LIMIT 1`,
      [username, username, normalizedPhone]
    );

    if (admins.length === 0) {
      return res.json({
        message: "If the account is registered, a password reset link has been sent."
      });
    }

    const admin = admins[0];
    const recoveryEmail = String(admin.email || "").trim();

    if (!recoveryEmail) {
      return res.status(400).json({
        message: "This committee account does not have a recovery email yet. Please contact the system administrator."
      });
    }

    const { rawToken, tokenHash } = createPasswordResetToken();

    await clearPasswordResetTokens("admin", admin.admin_id);
    await savePasswordResetToken({
      role: "admin",
      recipientId: admin.admin_id,
      email: recoveryEmail,
      tokenHash
    });

    await sendCommitteePasswordResetEmail({
      to: recoveryEmail,
      userName: admin.name || admin.username || "Committee User",
      roleType: admin.role_type || "Committee Member",
      resetUrl: buildPasswordResetUrl(req, "admin", rawToken),
      expiresInMinutes: PASSWORD_RESET_EXPIRY_MINUTES
    });

    return res.json({
      message: "If the account is registered, a password reset link has been sent."
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to send committee password reset email",
      error: error.message
    });
  }
});

app.post("/api/auth/password-reset/verify", async (req, res) => {
  const token = String(req.body.token || "").trim();
  const role = String(req.body.role || "").trim().toLowerCase();

  if (!token || !["resident", "admin"].includes(role)) {
    return res.status(400).json({
      message: "A valid reset token is required"
    });
  }

  try {
    const resetRecord = await getActivePasswordResetTokenRecord({ role, token });

    if (!resetRecord) {
      return res.status(400).json({
        message: "This password reset link is invalid or has expired"
      });
    }

    return res.json({
      message: "Password reset link verified",
      expiresAt: resetRecord.expires_at
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to verify password reset link",
      error: error.message
    });
  }
});

app.post("/api/auth/password-reset/complete", async (req, res) => {
  const token = String(req.body.token || "").trim();
  const role = String(req.body.role || "").trim().toLowerCase();
  const newPassword = String(req.body.newPassword || "");

  if (!token || !["resident", "admin"].includes(role) || !newPassword) {
    return res.status(400).json({
      message: "Reset token and new password are required"
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      message: "New password must be at least 6 characters long"
    });
  }

  try {
    const resetRecord = await getActivePasswordResetTokenRecord({ role, token });

    if (!resetRecord) {
      return res.status(400).json({
        message: "This password reset link is invalid or has expired"
      });
    }

    const hashedPassword = await hashPassword(newPassword);

    if (role === "resident") {
      await query(
        "UPDATE users SET password = ? WHERE user_id = ?",
        [hashedPassword, resetRecord.recipient_id]
      );
    } else {
      await query(
        `UPDATE ${ADMIN_TABLE} SET password = ? WHERE admin_id = ?`,
        [hashedPassword, resetRecord.recipient_id]
      );
    }

    await consumePasswordResetToken(resetRecord.reset_id);

    return res.json({
      message: "Password reset successfully"
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to reset password",
      error: error.message
    });
  }
});

app.get("/api/profile/resident/:userId", async (req, res) => {
  try {
    const residents = await query(
      "SELECT user_id, name, email, phone, address, house_no FROM users WHERE user_id = ? LIMIT 1",
      [req.params.userId]
    );

    if (residents.length === 0) {
      return res.status(404).json({
        message: "Resident profile not found"
      });
    }

    const resident = residents[0];
    return res.json({
      id: resident.user_id,
      fullName: resident.name,
      email: resident.email,
      phone: resident.phone || "",
      address: resident.address || "",
      houseNo: resident.house_no || ""
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch resident profile",
      error: error.message
    });
  }
});

app.patch("/api/profile/resident/:userId", async (req, res) => {
  const { fullName, email, phone, address } = req.body;

  if (!fullName || !email || !phone || !address) {
    return res.status(400).json({
      message: "Name, email, mobile number, and home address are required"
    });
  }

  try {
    const residents = await query(
      "SELECT user_id, name, email, phone, address, house_no, zone FROM users WHERE user_id = ? LIMIT 1",
      [req.params.userId]
    );

    if (residents.length === 0) {
      return res.status(404).json({
        message: "Resident profile not found"
      });
    }

    const duplicates = await query(
      "SELECT user_id FROM users WHERE email = ? AND user_id <> ? LIMIT 1",
      [email, req.params.userId]
    );

    if (duplicates.length > 0) {
      return res.status(409).json({
        message: "Another resident already uses this email address"
      });
    }
    const currentResident = residents[0];
    const effectiveZone = currentResident.zone || "General";
    const changeSummary = buildResidentUpdateSummary(currentResident, {
      name: fullName,
      email,
      phone,
      address,
      houseNo: currentResident.house_no,
      zone: effectiveZone
    });
    const actionTaken = "Resident profile updated";

    await query(
      "UPDATE users SET name = ?, email = ?, phone = ?, address = ? WHERE user_id = ?",
      [fullName, email, phone, address, req.params.userId]
    );

    let emailWarning = "";
    try {
      const updatedByName = fullName || currentResident.name || "Resident";
      const adminRecipients = await getAdminEmailRecipients();
      const normalizedResidentEmail = String(email || "").trim().toLowerCase();
      const eventStamp = Date.now();
      const emailTasks = [];

      if (normalizedResidentEmail) {
        emailTasks.push(
          sendEmailOnce({
            eventKey: `resident-self-updated:user:${req.params.userId}:${normalizedResidentEmail}:${eventStamp}`,
            eventType: "resident-self-updated-user",
            recipientEmail: normalizedResidentEmail,
            send: () =>
              sendResidentProfileUpdatedResidentEmail({
                to: email,
                residentName: fullName || currentResident.name || "Resident",
                updatedByName,
                actionTaken,
                changeSummary,
                email,
                phone,
                address,
                houseNo: currentResident.house_no,
                zone: effectiveZone
              })
            })
        );
      }

      emailTasks.push(
        ...adminRecipients.map((admin) =>
          sendEmailOnce({
            eventKey: `resident-self-updated:admin:${req.params.userId}:${admin.email}:${eventStamp}`,
            eventType: "resident-self-updated-admin",
            recipientEmail: admin.email,
            send: () =>
              sendResidentProfileUpdatedAdminEmail({
                to: admin.email,
                adminName: admin.name,
                residentName: fullName || currentResident.name || "Resident",
                residentEmail: email,
                phone,
                address,
                houseNo: currentResident.house_no,
                zone: effectiveZone,
                updatedByName,
                actionTaken: "Resident profile updated by resident",
                changeSummary
              })
          })
        )
      );

      await Promise.all(emailTasks);
    } catch (mailError) {
      emailWarning = ` Profile updated, but email notification failed: ${mailError.message}`;
      console.error("Resident self-profile update email delivery failed:", mailError.message);
    }

    return res.json({
      message: `Resident profile updated successfully.${emailWarning}`
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update resident profile",
      error: error.message
    });
  }
});

app.patch("/api/profile/resident/:userId/password", async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      message: "Current password and new password are required"
    });
  }

  if (String(newPassword).length < 6) {
    return res.status(400).json({
      message: "New password must be at least 6 characters long"
    });
  }

  try {
    const residents = await query(
      "SELECT user_id, password FROM users WHERE user_id = ? LIMIT 1",
      [req.params.userId]
    );

    if (residents.length === 0) {
      return res.status(404).json({
        message: "Resident profile not found"
      });
    }

    const resident = residents[0];
    const isMatch = await comparePassword(currentPassword, resident.password);

    if (!isMatch) {
      return res.status(401).json({
        message: "Current password is incorrect"
      });
    }

    const hashedPassword = await hashPassword(newPassword);
    await query("UPDATE users SET password = ? WHERE user_id = ?", [hashedPassword, req.params.userId]);

    return res.json({
      message: "Password changed successfully"
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to change password",
      error: error.message
    });
  }
});

app.get("/api/profile/admin/:adminId", async (req, res) => {
  try {
    const admins = await query(
      `SELECT admin_id, name, email, role_type, phone, address FROM ${ADMIN_TABLE} WHERE admin_id = ? LIMIT 1`,
      [req.params.adminId]
    );

    if (admins.length === 0) {
      return res.status(404).json({
        message: "Committee profile not found"
      });
    }

    const admin = admins[0];
    return res.json({
      id: admin.admin_id,
      name: admin.name,
      email: admin.email || "",
      roleType: admin.role_type || "Committee Member",
      phone: admin.phone || "",
      address: admin.address || ""
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch committee profile",
      error: error.message
    });
  }
});

app.patch("/api/profile/admin/:adminId", async (req, res) => {
  const { name, email, phone, address } = req.body;

  if (!name || !email || !phone || !address) {
    return res.status(400).json({
      message: "Name, email, mobile number, and home address are required"
    });
  }

  try {
    const admins = await query(
      `SELECT admin_id FROM ${ADMIN_TABLE} WHERE admin_id = ? LIMIT 1`,
      [req.params.adminId]
    );

    if (admins.length === 0) {
      return res.status(404).json({
        message: "Committee profile not found"
      });
    }

    const duplicates = await query(
      `SELECT admin_id FROM ${ADMIN_TABLE} WHERE email = ? AND admin_id <> ? LIMIT 1`,
      [email, req.params.adminId]
    );

    if (duplicates.length > 0) {
      return res.status(409).json({
        message: "Another committee user already uses this email"
      });
    }

    await query(
      `UPDATE ${ADMIN_TABLE} SET name = ?, email = ?, phone = ?, address = ? WHERE admin_id = ?`,
      [name, email, phone, address, req.params.adminId]
    );

    return res.json({
      message: "Committee profile updated successfully"
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update committee profile",
      error: error.message
    });
  }
});

app.patch("/api/profile/admin/:adminId/password", async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      message: "Current password and new password are required"
    });
  }

  if (String(newPassword).length < 6) {
    return res.status(400).json({
      message: "New password must be at least 6 characters long"
    });
  }

  try {
    const admins = await query(
      `SELECT admin_id, password FROM ${ADMIN_TABLE} WHERE admin_id = ? LIMIT 1`,
      [req.params.adminId]
    );

    if (admins.length === 0) {
      return res.status(404).json({
        message: "Committee profile not found"
      });
    }

    const admin = admins[0];
    const isMatch = await comparePassword(currentPassword, admin.password);

    if (!isMatch) {
      return res.status(401).json({
        message: "Current password is incorrect"
      });
    }

    const hashedPassword = await hashPassword(newPassword);
    await query(`UPDATE ${ADMIN_TABLE} SET password = ? WHERE admin_id = ?`, [hashedPassword, req.params.adminId]);

    return res.json({
      message: "Password changed successfully"
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to change password",
      error: error.message
    });
  }
});

app.get("/api/admins", async (_req, res) => {
  try {
    const admins = await query(
      `SELECT admin_id, username, name, email, phone, role_type, account_status
         FROM ${ADMIN_TABLE}
         ORDER BY name ASC, username ASC`
    );

    return res.json(
        admins.map((admin) => ({
          id: admin.admin_id,
          username: admin.username,
          name: admin.name,
          email: admin.email || "",
          phone: admin.phone || "",
          roleType: admin.role_type || "Committee Member",
          accountStatus: admin.account_status || "Active"
        }))
      );
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch committee users",
      error: error.message
    });
  }
});

app.post("/api/admins", async (req, res) => {
  const { username, name, email, phone, password, roleType, accountStatus } = req.body;
  const normalizedAccountStatus = String(accountStatus || "Active").trim() === "Inactive" ? "Inactive" : "Active";

  if (!username || !name || !email || !password || !roleType) {
    return res.status(400).json({
      message: "Name, username, email, password, and role are required"
    });
  }

  try {
    const existingAdmins = await query(
      `SELECT admin_id
       FROM ${ADMIN_TABLE}
       WHERE username = ? OR email = ?
       LIMIT 1`,
      [username, email]
    );

    if (existingAdmins.length > 0) {
      return res.status(409).json({
        message: "An admin account with that username or email already exists"
      });
    }

    const hashedPassword = await hashPassword(password);

      const result = await query(
        `INSERT INTO ${ADMIN_TABLE} (username, password, name, email, phone, role_type, account_status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [username, hashedPassword, name, email, phone || null, roleType, normalizedAccountStatus]
      );

        const autoAssignedComplaintCount =
          normalizedAccountStatus === "Active"
            ? await assignExistingComplaintsToCommitteeUser({
                adminId: result.insertId,
                roleType,
                takeOverRoleAssignments: true
              })
            : 0;
      const accessibleDustbinCount = normalizedAccountStatus === "Active"
        ? await getExistingDustbinCountForCommitteeRole(roleType)
        : 0;

      const adminRecipients = await query(
        `SELECT admin_id, name, email
       FROM ${ADMIN_TABLE}
       WHERE email IS NOT NULL
         AND email <> ''
         AND (
           role_type LIKE '%Committee%'
           OR role_type LIKE '%Admin%'
           OR role_type = 'Super Admin'
         )`
    );

    let emailWarning = "";
    try {
      const dedupedAdmins = Array.from(
        adminRecipients.reduce((map, admin) => {
          const recipientEmail = String(admin.email || "").trim().toLowerCase();
          if (!recipientEmail || map.has(recipientEmail)) {
            return map;
          }

          map.set(recipientEmail, {
            email: recipientEmail,
            name: admin.name || "Committee Member"
          });
          return map;
        }, new Map()).values()
      );

      const emailTasks = [
        sendEmailOnce({
          eventKey: `committee-created:user:${result.insertId}:${String(email).trim().toLowerCase()}`,
          eventType: "committee-created-user",
          recipientEmail: String(email).trim().toLowerCase(),
          send: () =>
            sendCommitteeAccountUserEmail({
              to: email,
              userName: name,
              username,
              roleType,
              password,
              isNewAccount: true
            })
        }),
        ...dedupedAdmins.map((admin) =>
          sendEmailOnce({
            eventKey: `committee-created:admin:${result.insertId}:${admin.email}`,
            eventType: "committee-created-admin",
            recipientEmail: admin.email,
            send: () =>
              sendCommitteeAccountAdminEmail({
                to: admin.email,
                adminName: admin.name,
                userName: name,
                username,
                roleType,
                isNewAccount: true
              })
          })
        )
      ];

      await Promise.all(emailTasks);
    } catch (mailError) {
      emailWarning = ` Committee user saved, but email notification failed: ${mailError.message}`;
      console.error("Committee account creation email delivery failed:", mailError.message);
    }

      return res.status(201).json({
        message: `Committee user created successfully.${autoAssignedComplaintCount > 0 ? ` ${autoAssignedComplaintCount} existing complaint${autoAssignedComplaintCount === 1 ? "" : "s"} auto-assigned.` : ""}${accessibleDustbinCount > 0 ? ` Existing dustbin access is ready for ${accessibleDustbinCount} bin${accessibleDustbinCount === 1 ? "" : "s"}.` : ""}${emailWarning}`,
        adminId: result.insertId,
        autoAssignedComplaintCount,
        accessibleDustbinCount
      });
    } catch (error) {
      return res.status(500).json({
      message: "Failed to create committee user",
      error: error.message
    });
  }
});

app.patch("/api/admins/:adminId", async (req, res) => {
  const { username, name, email, phone, password, roleType, accountStatus } = req.body;
  const normalizedAccountStatus = String(accountStatus || "Active").trim() === "Inactive" ? "Inactive" : "Active";

  if (!username || !name || !email || !roleType) {
    return res.status(400).json({
      message: "Name, username, email, and role are required"
    });
  }

  try {
    const currentAdmins = await query(
      `SELECT admin_id, username, name, email, phone, role_type, account_status
       FROM ${ADMIN_TABLE}
       WHERE admin_id = ?
       LIMIT 1`,
      [req.params.adminId]
    );

    if (currentAdmins.length === 0) {
      return res.status(404).json({
        message: "Committee user not found"
      });
    }

    const currentAdmin = currentAdmins[0];
    const currentRoleType = String(currentAdmin.role_type || "").trim();
    const currentAccountStatus =
      String(currentAdmin.account_status || "Active").trim() === "Inactive" ? "Inactive" : "Active";
    const normalizedRoleType = String(roleType || "").trim();
    const roleChanged = currentRoleType !== normalizedRoleType;
    const shouldMoveOldComplaints =
      roleChanged || (currentAccountStatus === "Active" && normalizedAccountStatus !== "Active");

    const existingAdmins = await query(
      `SELECT admin_id
       FROM ${ADMIN_TABLE}
       WHERE (username = ? OR email = ?)
         AND admin_id <> ?
       LIMIT 1`,
      [username, email, req.params.adminId]
    );

    if (existingAdmins.length > 0) {
      return res.status(409).json({
        message: "Another admin already uses that username or email"
      });
    }

    if (password) {
      const hashedPassword = await hashPassword(password);
      await query(
        `UPDATE ${ADMIN_TABLE}
         SET username = ?, name = ?, email = ?, phone = ?, password = ?, role_type = ?, account_status = ?
         WHERE admin_id = ?`,
        [username, name, email, phone || null, hashedPassword, roleType, normalizedAccountStatus, req.params.adminId]
      );
      } else {
        await query(
          `UPDATE ${ADMIN_TABLE}
           SET username = ?, name = ?, email = ?, phone = ?, role_type = ?, account_status = ?
         WHERE admin_id = ?`,
          [username, name, email, phone || null, roleType, normalizedAccountStatus, req.params.adminId]
        );
      }

        const reassignedOldComplaintCount =
          shouldMoveOldComplaints
            ? await reassignExistingComplaintsFromCommitteeUser({
                adminId: Number(req.params.adminId),
                nextRoleType: normalizedRoleType,
                nextAccountStatus: normalizedAccountStatus
              })
            : 0;
        const autoAssignedComplaintCount =
          normalizedAccountStatus === "Active"
            ? await assignExistingComplaintsToCommitteeUser({
                adminId: Number(req.params.adminId),
                roleType: normalizedRoleType,
                takeOverRoleAssignments: true
              })
            : 0;
      const accessibleDustbinCount = normalizedAccountStatus === "Active"
        ? await getExistingDustbinCountForCommitteeRole(normalizedRoleType)
        : 0;

      const adminRecipients = await query(
        `SELECT admin_id, name, email
       FROM ${ADMIN_TABLE}
       WHERE email IS NOT NULL
         AND email <> ''
         AND (
           role_type LIKE '%Committee%'
           OR role_type LIKE '%Admin%'
           OR role_type = 'Super Admin'
         )`
    );

    let emailWarning = "";
    try {
      const dedupedAdmins = Array.from(
        adminRecipients.reduce((map, admin) => {
          const recipientEmail = String(admin.email || "").trim().toLowerCase();
          if (!recipientEmail || map.has(recipientEmail)) {
            return map;
          }

          map.set(recipientEmail, {
            email: recipientEmail,
            name: admin.name || "Committee Member"
          });
          return map;
        }, new Map()).values()
      );

      const normalizedUserEmail = String(email).trim().toLowerCase();
      const emailTasks = [
        sendEmailOnce({
          eventKey: `committee-updated:user:${req.params.adminId}:${normalizedUserEmail}:${Date.now()}`,
          eventType: "committee-updated-user",
          recipientEmail: normalizedUserEmail,
          send: () =>
            sendCommitteeAccountUserEmail({
              to: email,
              userName: name,
              username,
              roleType,
              password: password || "",
              isNewAccount: false
            })
        }),
        ...dedupedAdmins.map((admin) =>
          sendEmailOnce({
            eventKey: `committee-updated:admin:${req.params.adminId}:${admin.email}:${Date.now()}`,
            eventType: "committee-updated-admin",
            recipientEmail: admin.email,
            send: () =>
              sendCommitteeAccountAdminEmail({
                to: admin.email,
                adminName: admin.name,
                userName: name,
                username,
                roleType,
                isNewAccount: false
              })
          })
        )
      ];

      await Promise.all(emailTasks);
    } catch (mailError) {
      emailWarning = ` Committee user updated, but email notification failed: ${mailError.message}`;
      console.error("Committee account update email delivery failed:", mailError.message);
    }

      return res.json({
        message: `Committee user updated successfully.${reassignedOldComplaintCount > 0 ? ` ${reassignedOldComplaintCount} old complaint${reassignedOldComplaintCount === 1 ? "" : "s"} moved to admin or related committee.` : ""}${autoAssignedComplaintCount > 0 ? ` ${autoAssignedComplaintCount} existing complaint${autoAssignedComplaintCount === 1 ? "" : "s"} auto-assigned.` : ""}${accessibleDustbinCount > 0 ? ` Existing dustbin access is ready for ${accessibleDustbinCount} bin${accessibleDustbinCount === 1 ? "" : "s"}.` : ""}${emailWarning}`,
        reassignedOldComplaintCount,
        autoAssignedComplaintCount,
        accessibleDustbinCount
      });
    } catch (error) {
      return res.status(500).json({
      message: "Failed to update committee user",
      error: error.message
    });
  }
});

app.delete("/api/admins/:adminId", async (req, res) => {
  try {
    const result = await query(
      `DELETE FROM ${ADMIN_TABLE} WHERE admin_id = ?`,
      [req.params.adminId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Committee user not found"
      });
    }

    return res.json({
      message: "Committee user deleted successfully"
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to delete committee user",
      error: error.message
    });
  }
});

app.get("/api/residents", async (req, res) => {
  const requestedStatus = String(req.query.status || "").trim().toLowerCase();
  const statusFilter =
    requestedStatus === "active" || requestedStatus === "inactive"
      ? requestedStatus.charAt(0).toUpperCase() + requestedStatus.slice(1)
      : "";

  try {
    const residents = await query(
      `SELECT user_id, name, phone, email, address, house_no, zone, account_status, created_at
       FROM users
       ${statusFilter ? "WHERE account_status = ?" : ""}
       ORDER BY name ASC`,
      statusFilter ? [statusFilter] : []
    );

    return res.json(
      residents.map((resident) => ({
        id: resident.user_id,
        name: resident.name,
        phone: resident.phone,
        email: resident.email,
        address: resident.address,
        houseNo: resident.house_no,
        zone: resident.zone || "General",
        accountStatus: resident.account_status || "Active",
        createdAt: resident.created_at
      }))
    );
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch residents",
      error: error.message
    });
  }
});

app.get("/api/residents/:residentId/history", async (req, res) => {
  try {
    const history = await getResidentHistory(req.params.residentId);
    return res.json(history);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch resident update history",
      error: error.message
    });
  }
});

app.patch("/api/residents/:residentId", async (req, res) => {
  const { name, email, phone, address, houseNo, zone, accountStatus, updatedByName } = req.body;
  const normalizedAccountStatus = String(accountStatus || "Active").trim() === "Inactive" ? "Inactive" : "Active";

  if (!name || !email || !phone || !address || !houseNo) {
    return res.status(400).json({
      message: "Name, email, phone, address, and house number are required"
    });
  }

  try {
    const currentResidents = await query(
      "SELECT user_id, name, email, phone, address, house_no, zone, account_status FROM users WHERE user_id = ? LIMIT 1",
      [req.params.residentId]
    );

    if (currentResidents.length === 0) {
      return res.status(404).json({
        message: "Resident not found"
      });
    }

    const existingResidents = await query(
      "SELECT user_id FROM users WHERE email = ? AND user_id <> ? LIMIT 1",
      [email, req.params.residentId]
    );

    if (existingResidents.length > 0) {
      return res.status(409).json({
        message: "Another resident already uses this email address"
      });
    }

    const currentResident = currentResidents[0];
    const effectiveZone = zone || "General";
    const changeSummary = buildResidentUpdateSummary(currentResident, {
      name,
      email,
      phone,
      address,
      houseNo,
      zone: effectiveZone,
      accountStatus: normalizedAccountStatus
    });
    let actionTaken = getResidentUpdateActionTaken(
      currentResident,
      { accountStatus: normalizedAccountStatus },
      updatedByName || "Administrator"
    );

    let releasedDustbinCount = 0;

    if (String(currentResident.account_status || "Active") !== "Inactive" && normalizedAccountStatus === "Inactive") {
      const releaseResult = await releaseDustbinAssignmentsForResident(req.params.residentId);
      releasedDustbinCount = releaseResult.releasedCount;
      if (releasedDustbinCount > 0) {
        actionTaken = "Resident account marked inactive and dustbins released";
      }
    }

    const result = await query(
      "UPDATE users SET name = ?, email = ?, phone = ?, address = ?, house_no = ?, zone = ?, account_status = ? WHERE user_id = ?",
      [name, email, phone, address, houseNo, zone || "General", normalizedAccountStatus, req.params.residentId]
    );

    await query(
      "INSERT INTO resident_update_history (resident_id, admin_name, action_type, details) VALUES (?, ?, ?, ?)",
      [
        req.params.residentId,
        updatedByName || "Administrator",
        "Updated",
        `${changeSummary}${releasedDustbinCount > 0 ? ` | released dustbins for reassignment: ${releasedDustbinCount}` : ""}`
      ]
    );

    let emailWarning = "";
    try {
      const adminRecipients = await getAdminEmailRecipients();
      const normalizedResidentEmail = String(email || "").trim().toLowerCase();
      const eventStamp = Date.now();
      const effectiveUpdatedByName = updatedByName || "Administrator";
      const emailTasks = [];

      if (normalizedResidentEmail) {
        emailTasks.push(
          sendEmailOnce({
            eventKey: `resident-updated:user:${req.params.residentId}:${normalizedResidentEmail}:${eventStamp}`,
            eventType: "resident-updated-user",
            recipientEmail: normalizedResidentEmail,
            send: () =>
              sendResidentProfileUpdatedResidentEmail({
                to: email,
                residentName: name,
                updatedByName: effectiveUpdatedByName,
                actionTaken,
                changeSummary,
                email,
                phone,
                address,
                houseNo,
                zone: effectiveZone
              })
          })
        );
      }

      emailTasks.push(
        ...adminRecipients.map((admin) =>
          sendEmailOnce({
            eventKey: `resident-updated:admin:${req.params.residentId}:${admin.email}:${eventStamp}`,
            eventType: "resident-updated-admin",
            recipientEmail: admin.email,
            send: () =>
              sendResidentProfileUpdatedAdminEmail({
                to: admin.email,
                adminName: admin.name,
                residentName: name,
                residentEmail: email,
                phone,
                address,
                houseNo,
                zone: effectiveZone,
                updatedByName: effectiveUpdatedByName,
                actionTaken,
                changeSummary
              })
          })
        )
      );

      await Promise.all(emailTasks);
    } catch (mailError) {
      emailWarning = ` Resident updated, but email notification failed: ${mailError.message}`;
      console.error("Resident update email delivery failed:", mailError.message);
    }

    const releaseMessage =
      releasedDustbinCount > 0
        ? ` ${releasedDustbinCount} assigned dustbin${releasedDustbinCount === 1 ? " was" : "s were"} released for reassignment.`
        : "";

    return res.json({
      message: `Resident updated successfully.${releaseMessage}${emailWarning}`
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update resident",
      error: error.message
    });
  }
});

app.delete("/api/residents/:residentId", async (req, res) => {
  const { deletedByName } = req.body || {};

  try {
    const currentResidents = await query(
      "SELECT user_id, name, email FROM users WHERE user_id = ? LIMIT 1",
      [req.params.residentId]
    );

    if (currentResidents.length === 0) {
      return res.status(404).json({
        message: "Resident not found"
      });
    }

    const currentResident = currentResidents[0];

    await query(
      "INSERT INTO resident_update_history (resident_id, admin_name, action_type, details) VALUES (?, ?, ?, ?)",
      [
        req.params.residentId,
        deletedByName || "Administrator",
        "Deleted",
        `Removed resident ${currentResident.name} (${currentResident.email}) from the directory.`
      ]
    );

    const dustbinCleanup = await deleteDustbinsForResident(req.params.residentId);

    const result = await query(
      "DELETE FROM users WHERE user_id = ?",
      [req.params.residentId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Resident not found"
      });
    }

    const dustbinMessage =
      dustbinCleanup.deletedCount > 0
        ? ` ${dustbinCleanup.deletedCount} assigned dustbin${dustbinCleanup.deletedCount === 1 ? " was" : "s were"} also removed.`
        : "";

    return res.json({
      message: `Resident deleted successfully.${dustbinMessage}`
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to delete resident",
      error: error.message
    });
  }
});

app.post("/api/contact-admin", async (req, res) => {
  const { fullName, email, subject, message } = req.body;

  if (!fullName || !email || !subject || !message) {
    return res.status(400).json({
      message: "Full name, email, subject, and message are required"
    });
  }

  try {
    const adminRecipients = await getAdminEmailRecipients();
    const supportEmail = String(process.env.ADMIN_SUPPORT_EMAIL || process.env.SMTP_FROM_EMAIL || "")
      .trim()
      .toLowerCase();
    const mergedRecipients = Array.from(
      [...adminRecipients, ...(supportEmail ? [{ email: supportEmail, name: "Support Team" }] : [])].reduce(
        (map, recipient) => {
          const recipientEmail = String(recipient.email || "").trim().toLowerCase();
          if (!recipientEmail || map.has(recipientEmail)) {
            return map;
          }

          map.set(recipientEmail, {
            email: recipientEmail,
            name: recipient.name || "Committee Member"
          });
          return map;
        },
        new Map()
      ).values()
    );

    if (mergedRecipients.length === 0) {
      return res.status(500).json({
        message: "No active admin contact email is configured"
      });
    }

    const eventStamp = Date.now();
    await Promise.all([
      ...mergedRecipients.map((recipient) =>
        sendEmailOnce({
          eventKey: `contact-admin:${String(email).trim().toLowerCase()}:${recipient.email}:${eventStamp}`,
          eventType: "contact-admin",
          recipientEmail: recipient.email,
          send: () =>
            sendContactAdminEmail({
              to: recipient.email,
              adminName: recipient.name,
              fromName: fullName,
              fromEmail: email,
              subject,
              message
            })
        })
      ),
      sendContactConfirmationEmail({
        to: email,
        residentName: fullName,
        subject
      })
    ]);

    return res.status(201).json({
      message: "Your message has been sent to the admin team"
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to send contact message",
      error: error.message
    });
  }
});

app.post("/api/complaints", async (req, res) => {
  const { userId, category, message, photoData, priority, serviceModuleId } = req.body;

  if (!userId || !category || !message) {
    return res.status(400).json({
      message: "User, category, and message are required"
    });
  }

  try {
    const normalizedPriority = priority || "Medium";
    const dueDate = getDueDateFromSla(category, normalizedPriority);
    const autoAssignment = await getAutoComplaintAssignment(category);
    const result = await query(
      `INSERT INTO complaints (
        user_id, category, message, photo_data, status, admin_remark, priority, escalated, due_date, assigned_admin_id, assigned_committee
      ) VALUES (?, ?, ?, ?, 'Pending', NULL, ?, 0, ?, ?, ?)`,
      [
        userId,
        category,
        message,
        photoData || null,
        normalizedPriority,
        dueDate,
        autoAssignment.assignedAdminId,
        autoAssignment.assignedCommittee
      ]
    );

    const residents = await query(
      `SELECT user_id, name, email
       FROM users
       WHERE user_id = ?
       LIMIT 1`,
      [userId]
    );

    const admins = await query(
      `SELECT admin_id, name, email
       FROM ${ADMIN_TABLE}
       WHERE role_type LIKE '%Committee%'
          OR role_type LIKE '%Admin%'
          OR role_type = 'Super Admin'`
    );

      await createBulkNotifications(
        admins.map((admin) => ({
          recipientRole: "admin",
          recipientAdminId: admin.admin_id,
          type: "complaint_created",
          title: "New complaint submitted",
          message: `${category} complaint was submitted${
            autoAssignment.assignedAdminName
              ? ` and assigned to ${autoAssignment.assignedAdminName}`
              : autoAssignment.assignedCommittee
                ? ` and routed to ${autoAssignment.assignedCommittee}${
                    serviceModuleId ? ` through the ${serviceModuleId} service desk` : ""
                  }`
                : ""
          }.`,
          linkPath: `/admin/complaints/${result.insertId}`
        }))
      );

    const resident = residents[0] ?? null;
    const adminRecipients = Array.from(
      admins.reduce((map, admin) => {
        const email = String(admin.email || "").trim().toLowerCase();
        if (!email || map.has(email)) {
          return map;
        }

        map.set(email, {
          email,
          name: admin.name || "Committee Member"
        });
        return map;
      }, new Map())
        .values()
    );

    let emailWarning = "";
    try {
      const emailTasks = [];

      if (resident?.email) {
        emailTasks.push(
          sendEmailOnce({
            eventKey: `complaint-created:resident:${result.insertId}:${String(resident.email).trim().toLowerCase()}`,
            eventType: "complaint-created-resident",
            recipientEmail: String(resident.email).trim().toLowerCase(),
            send: () =>
              sendComplaintCreatedResidentEmail({
                to: resident.email,
                residentName: resident.name || "Resident",
                complaintCategory: category,
                priority: normalizedPriority,
                dueDate,
                complaintId: result.insertId
              })
          })
        );
      }

      emailTasks.push(
        ...adminRecipients.map((admin) =>
          sendEmailOnce({
            eventKey: `complaint-created:admin:${result.insertId}:${admin.email}`,
            eventType: "complaint-created-admin",
            recipientEmail: admin.email,
            send: () =>
              sendComplaintCreatedAdminEmail({
                to: admin.email,
                committeeName: admin.name,
                residentName: resident?.name || "Resident",
                complaintCategory: category,
                priority: normalizedPriority,
                dueDate,
                complaintId: result.insertId
              })
          })
        )
      );

      await Promise.all(emailTasks);
    } catch (mailError) {
      emailWarning = ` Complaint submitted, but email notification failed: ${mailError.message}`;
      console.error("Complaint creation email delivery failed:", mailError.message);
    }

    return res.status(201).json({
      message: `Complaint submitted successfully.${emailWarning}`,
      complaintId: result.insertId,
      dueDate
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to submit complaint",
      error: error.message
    });
  }
});

app.get("/api/complaints/resident/:userId", async (req, res) => {
  try {
    await runAutoEscalation();
    const complaints = await query(
      `SELECT complaint_id, category, message, photo_data, status, admin_remark, priority, escalated, due_date,
              assigned_admin_id, assigned_committee, created_at, updated_at
       FROM complaints
       WHERE user_id = ?
       ORDER BY complaint_id DESC, created_at DESC`,
      [req.params.userId]
    );

    return res.json(complaints);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch resident complaints",
      error: error.message
    });
  }
});

app.get("/api/complaints/resident/:userId/:complaintId", async (req, res) => {
  try {
    await runAutoEscalation();
    const complaints = await query(
      `SELECT complaint_id, category, message, photo_data, status, admin_remark, priority, escalated, due_date,
              assigned_admin_id, assigned_committee, created_at, updated_at
       FROM complaints
       WHERE user_id = ? AND complaint_id = ?
       LIMIT 1`,
      [req.params.userId, req.params.complaintId]
    );

    if (complaints.length === 0) {
      return res.status(404).json({
        message: "Complaint not found"
      });
    }

    const complaint = complaints[0];
    const updates = await getComplaintUpdates(req.params.complaintId);

    return res.json({
      ...complaint,
      updates
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch complaint details",
      error: error.message
    });
  }
});

app.patch("/api/complaints/resident/:userId/:complaintId", async (req, res) => {
  const { category, message, photoData, priority } = req.body;

  if (!category || !message) {
    return res.status(400).json({
      message: "Category and message are required"
    });
  }

  try {
    const complaints = await query(
      `SELECT complaint_id
       FROM complaints
       WHERE user_id = ? AND complaint_id = ?
       LIMIT 1`,
      [req.params.userId, req.params.complaintId]
    );

    if (complaints.length === 0) {
      return res.status(404).json({
        message: "Complaint not found"
      });
    }

    await query(
      `UPDATE complaints
       SET category = ?, message = ?, photo_data = ?, priority = ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND complaint_id = ?`,
      [category, message, photoData || null, priority || "Medium", req.params.userId, req.params.complaintId]
    );

    return res.json({
      message: "Complaint updated successfully"
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update complaint",
      error: error.message
    });
  }
});

app.get("/api/complaints", async (_req, res) => {
  try {
    await runAutoEscalation();
    const complaints = await query(
      `SELECT c.complaint_id, c.user_id, u.name, u.email, u.phone, c.category, c.message, c.photo_data,
              c.status, c.admin_remark, c.priority, c.escalated, c.due_date, c.assigned_admin_id,
              c.assigned_committee, a.name AS assigned_admin_name, u.zone,
              c.created_at, c.updated_at
       FROM complaints c
       INNER JOIN users u ON u.user_id = c.user_id
       LEFT JOIN ${ADMIN_TABLE} a ON a.admin_id = c.assigned_admin_id
       ORDER BY c.escalated DESC, c.complaint_id DESC`
    );

    return res.json(complaints);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch complaints",
      error: error.message
    });
  }
});

app.get("/api/complaints/:complaintId", async (req, res) => {
  try {
    await runAutoEscalation();
    const complaints = await query(
      `SELECT c.complaint_id, c.user_id, u.name, u.email, u.phone, c.category, c.message, c.photo_data,
              c.status, c.admin_remark, c.priority, c.escalated, c.due_date, c.assigned_admin_id,
              c.assigned_committee, a.name AS assigned_admin_name, u.zone, c.created_at, c.updated_at
       FROM complaints c
       INNER JOIN users u ON u.user_id = c.user_id
       LEFT JOIN ${ADMIN_TABLE} a ON a.admin_id = c.assigned_admin_id
       WHERE c.complaint_id = ?
       LIMIT 1`,
      [req.params.complaintId]
    );

    if (complaints.length === 0) {
      return res.status(404).json({
        message: "Complaint not found"
      });
    }

    const complaint = complaints[0];
    const updates = await getComplaintUpdates(req.params.complaintId);

    return res.json({
      ...complaint,
      updates
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch complaint details",
      error: error.message
    });
  }
});

app.get("/api/sla/complaints/overview", async (_req, res) => {
  try {
    await runAutoEscalation();

    const complaints = await query(
      `SELECT complaint_id, category, priority, status, due_date, escalated
       FROM complaints`
    );

    const today = new Date().toISOString().slice(0, 10);
    const overview = {
      total: complaints.length,
      overdue: 0,
      dueToday: 0,
      escalated: 0,
      onTrack: 0,
      resolved: 0
    };

    const moduleMap = new Map();

    for (const complaint of complaints) {
      const dueDate = normalizeDateOnly(complaint.due_date);
      const isResolved = complaint.status === "Resolved";
      const isOverdue = Boolean(dueDate && !isResolved && dueDate < today);
      const isDueToday = Boolean(dueDate && !isResolved && dueDate === today);
      const isEscalated = Boolean(complaint.escalated);
      const isOnTrack = !isResolved && !isOverdue && !isEscalated;
      const module = mapCategoryToServiceModule(complaint.category);

      if (!moduleMap.has(module.id)) {
        moduleMap.set(module.id, {
          moduleId: module.id,
          moduleLabel: module.label,
          total: 0,
          overdue: 0,
          dueToday: 0,
          escalated: 0,
          onTrack: 0,
          resolved: 0
        });
      }

      const stats = moduleMap.get(module.id);
      stats.total += 1;
      if (isOverdue) {
        stats.overdue += 1;
      }
      if (isDueToday) {
        stats.dueToday += 1;
      }
      if (isEscalated) {
        stats.escalated += 1;
      }
      if (isOnTrack) {
        stats.onTrack += 1;
      }
      if (isResolved) {
        stats.resolved += 1;
      }

      if (isOverdue) {
        overview.overdue += 1;
      }
      if (isDueToday) {
        overview.dueToday += 1;
      }
      if (isEscalated) {
        overview.escalated += 1;
      }
      if (isOnTrack) {
        overview.onTrack += 1;
      }
      if (isResolved) {
        overview.resolved += 1;
      }

    }

    return res.json({
      generatedAt: new Date().toISOString(),
      overview,
      byModule: Array.from(moduleMap.values())
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch complaint deadline overview",
      error: error.message
    });
  }
});

app.post("/api/sla/complaints/run", async (_req, res) => {
  try {
    const escalatedCount = await runAutoEscalation();
    return res.json({
      message: "Complaint deadline check completed",
      escalatedCount
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to run complaint deadline check",
      error: error.message
    });
  }
});

app.post("/api/complaints/:complaintId/updates", async (req, res) => {
  const { adminId, status, note, priority, dueDate, escalated, assignedAdminId, assignedCommittee } = req.body;

  if (!adminId || !status || !note) {
    return res.status(400).json({
      message: "Please enter a status and update note before saving."
    });
  }

  try {
    const admins = await query(
      `SELECT admin_id, name FROM ${ADMIN_TABLE} WHERE admin_id = ? LIMIT 1`,
      [adminId]
    );

    if (admins.length === 0) {
      return res.status(404).json({
        message: "Admin not found"
      });
    }

    const complaints = await query(
      `SELECT c.complaint_id, c.user_id, c.category, u.name AS resident_name, u.email AS resident_email
       FROM complaints c
       INNER JOIN users u ON u.user_id = c.user_id
       WHERE c.complaint_id = ?
       LIMIT 1`,
      [req.params.complaintId]
    );

    if (complaints.length === 0) {
      return res.status(404).json({
        message: "Complaint not found"
      });
    }

    const admin = admins[0];

    await query(
      "INSERT INTO complaint_updates (complaint_id, admin_id, admin_name, status, note) VALUES (?, ?, ?, ?, ?)",
      [req.params.complaintId, admin.admin_id, admin.name, status, note]
    );

    await query(
      `UPDATE complaints
       SET status = ?, admin_remark = ?, priority = ?, due_date = ?, escalated = ?, assigned_admin_id = ?, assigned_committee = ?
       WHERE complaint_id = ?`,
      [
        status,
        note,
        priority || "Medium",
        dueDate || null,
        escalated ? 1 : 0,
        assignedAdminId || null,
        assignedCommittee || "General Committee",
        req.params.complaintId
      ]
    );

    const complaint = complaints[0];

    if (complaint.resident_email) {
      await sendComplaintStatusEmail({
        to: complaint.resident_email,
        residentName: complaint.resident_name,
        complaintCategory: complaint.category,
        status,
        note
      });
    }

    await createNotification({
      recipientRole: "resident",
      recipientUserId: complaint.user_id,
      type: "complaint_updated",
      title: `Complaint updated: ${complaint.category}`,
      message: `Status changed to ${status}. ${note}`,
      linkPath: `/resident/complaints/${req.params.complaintId}`
    });

    return res.status(201).json({
      message: "Committee update added successfully"
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to add committee update",
      error: error.message
    });
  }
});

app.patch("/api/complaints/:complaintId", async (req, res) => {
  const { status, adminRemark, priority, dueDate, escalated, assignedAdminId, assignedCommittee } = req.body;

  if (!status) {
    return res.status(400).json({
      message: "Status is required"
    });
  }

  try {
    const complaints = await query(
      `SELECT c.complaint_id, c.user_id, c.category, u.name AS resident_name, u.email AS resident_email
       FROM complaints c
       INNER JOIN users u ON u.user_id = c.user_id
       WHERE c.complaint_id = ?
       LIMIT 1`,
      [req.params.complaintId]
    );

    if (complaints.length === 0) {
      return res.status(404).json({
        message: "Complaint not found"
      });
    }

    const result = await query(
      `UPDATE complaints
       SET status = ?, admin_remark = ?, priority = ?, due_date = ?, escalated = ?, assigned_admin_id = ?, assigned_committee = ?
       WHERE complaint_id = ?`,
      [
        status,
        adminRemark || null,
        priority || "Medium",
        dueDate || null,
        escalated ? 1 : 0,
        assignedAdminId || null,
        assignedCommittee || "General Committee",
        req.params.complaintId
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Complaint not found"
      });
    }

    const complaint = complaints[0];
    if (complaint.resident_email) {
      await sendComplaintStatusEmail({
        to: complaint.resident_email,
        residentName: complaint.resident_name,
        complaintCategory: complaint.category,
        status,
        note: adminRemark || "Your complaint has been updated by the committee."
      });
    }

    await createNotification({
      recipientRole: "resident",
      recipientUserId: complaint.user_id,
      type: "complaint_updated",
      title: `Complaint updated: ${complaint.category}`,
      message: `Status changed to ${status}. ${adminRemark || "Please check the latest update."}`,
      linkPath: `/resident/complaints/${req.params.complaintId}`
    });

    return res.json({
      message: "Complaint updated successfully"
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update complaint",
      error: error.message
    });
  }
});

app.delete("/api/complaints/:complaintId", async (req, res) => {
  try {
    await query("DELETE FROM complaint_updates WHERE complaint_id = ?", [req.params.complaintId]);
    const result = await query("DELETE FROM complaints WHERE complaint_id = ?", [req.params.complaintId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Complaint not found"
      });
    }

    return res.json({
      message: "Complaint deleted successfully"
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to delete complaint",
      error: error.message
    });
  }
});

app.get("/api/notices", async (req, res) => {
  const zone = req.query.zone ? String(req.query.zone).trim() : "";

  try {
    const notices = await query(
      `SELECT n.notice_id, n.admin_id, a.name AS admin_name, n.title, n.message AS description, n.photo_data, n.date, n.created_at,
              COALESCE(n.target_zone, 'All Zones') AS target_zone
       FROM notices n
       INNER JOIN ${ADMIN_TABLE} a ON a.admin_id = n.admin_id
       ${zone ? "WHERE COALESCE(n.target_zone, 'All Zones') IN (?, 'All Zones')" : ""}
       ORDER BY n.date DESC, n.notice_id DESC`,
      zone ? [zone] : []
    );

    return res.json(notices);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch notices",
      error: error.message
    });
  }
});

app.get("/api/notices/zones", async (_req, res) => {
  try {
    const rows = await query(
      `SELECT DISTINCT COALESCE(NULLIF(TRIM(zone), ''), 'General') AS zone
       FROM users
       ORDER BY zone ASC`
    );

    return res.json(
      rows
        .map((row) => String(row.zone || "").trim())
        .filter(Boolean)
    );
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch notice zones",
      error: error.message
    });
  }
});

app.post("/api/notices", async (req, res) => {
  const { adminId, title, description, photoData, date, targetZone } = req.body;

  if (!adminId || !title || !description || !date) {
    return res.status(400).json({
      message: "Admin, title, description, and date are required"
    });
  }

  try {
    const normalizedTargetZone = targetZone?.trim() ? targetZone.trim() : "All Zones";
    const result = await query(
      "INSERT INTO notices (admin_id, title, message, photo_data, date, target_zone) VALUES (?, ?, ?, ?, ?, ?)",
      [adminId, title, description, photoData || null, date, normalizedTargetZone]
    );

    const residentQueryParams = [];
    const residentZoneWhere =
      normalizedTargetZone === "All Zones"
        ? ""
        : "AND COALESCE(NULLIF(TRIM(zone), ''), 'General') = ?";

    if (residentZoneWhere) {
      residentQueryParams.push(normalizedTargetZone);
    }

    const residents = await query(
      `SELECT user_id, name, email
       FROM users
       WHERE email IS NOT NULL
         AND email <> ''
         ${residentZoneWhere}`,
      residentQueryParams
    );
    const committeeUsers = await query(
      `SELECT admin_id, name, email
       FROM ${ADMIN_TABLE}
       WHERE email IS NOT NULL
         AND email <> ''
         AND (
           role_type LIKE '%Committee%'
           OR role_type LIKE '%Admin%'
         )`
    );

    const recipientMap = new Map();
    [...residents, ...committeeUsers].forEach((recipient) => {
      const email = String(recipient.email || "").trim().toLowerCase();
      if (!email) {
        return;
      }
      if (!recipientMap.has(email)) {
        recipientMap.set(email, {
          email,
          name: recipient.name || "Community Member"
        });
      }
    });
    const recipients = Array.from(recipientMap.values());

    const residentRecipientCount = new Set(
      residents.map((recipient) => String(recipient.email || "").trim().toLowerCase()).filter(Boolean)
    ).size;
    const committeeRecipientCount = new Set(
      committeeUsers.map((recipient) => String(recipient.email || "").trim().toLowerCase()).filter(Boolean)
    ).size;

    let emailWarning = "";
    try {
      await Promise.all(
        recipients.map((recipient) =>
          sendEmailOnce({
            eventKey: `notice-created:${result.insertId}:${recipient.email}`,
            eventType: "notice-created",
            recipientEmail: recipient.email,
            send: () =>
              sendNoticeEmail({
                to: recipient.email,
                residentName: recipient.name,
                title,
                description,
                date,
                targetZone: normalizedTargetZone
              })
          })
        )
      );
    } catch (mailError) {
      emailWarning = ` Notice saved, but email notification failed: ${mailError.message}`;
      console.error("Notice email delivery failed:", mailError.message);
    }

    await createBulkNotifications([
      ...residents.map((resident) => ({
        recipientRole: "resident",
        recipientUserId: resident.user_id,
        type: "notice_created",
        title: title,
        message: `New notice published for ${normalizedTargetZone}.`,
        linkPath: `/resident/notices?notice=${result.insertId}`
      })),
      ...committeeUsers.map((admin) => ({
        recipientRole: "admin",
        recipientAdminId: admin.admin_id,
        type: "notice_created",
        title: title,
        message: `New notice published for ${normalizedTargetZone}.`,
        linkPath: `/admin/notices?notice=${result.insertId}`
      }))
    ]);

    return res.status(201).json({
      message: `Notice created successfully.${emailWarning}`,
      noticeId: result.insertId,
      recipients: {
        residents: residentRecipientCount,
        committees: committeeRecipientCount,
        totalUnique: recipients.length
      }
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to create notice",
      error: error.message
    });
  }
});

app.patch("/api/notices/:noticeId", async (req, res) => {
  const { title, description, photoData, date, targetZone, actorAdminId } = req.body;

  if (!actorAdminId || !title || !description || !date) {
    return res.status(400).json({
      message: "Admin, title, description, and date are required"
    });
  }

  try {
    const [noticeRows, adminRows] = await Promise.all([
      query("SELECT notice_id, admin_id FROM notices WHERE notice_id = ? LIMIT 1", [req.params.noticeId]),
      query(`SELECT admin_id, role_type FROM ${ADMIN_TABLE} WHERE admin_id = ? LIMIT 1`, [actorAdminId])
    ]);

    if (noticeRows.length === 0) {
      return res.status(404).json({
        message: "Notice not found"
      });
    }

    if (adminRows.length === 0) {
      return res.status(404).json({
        message: "Admin account not found"
      });
    }

    const notice = noticeRows[0];
    const actor = adminRows[0];
    const isSystemAdmin = String(actor.role_type || "").trim() === "Super Admin";
    const isOwner = Number(notice.admin_id) === Number(actor.admin_id);

    if (!isSystemAdmin && !isOwner) {
      return res.status(403).json({
        message: "You can only edit notices published by your own account"
      });
    }

    const normalizedTargetZone = targetZone?.trim() ? targetZone.trim() : "All Zones";
    const result = await query(
      "UPDATE notices SET title = ?, message = ?, photo_data = ?, date = ?, target_zone = ? WHERE notice_id = ?",
      [title, description, photoData || null, date, normalizedTargetZone, req.params.noticeId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Notice not found"
      });
    }

    return res.json({
      message: "Notice updated successfully"
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update notice",
      error: error.message
    });
  }
});

app.delete("/api/notices/:noticeId", async (req, res) => {
  const { actorAdminId } = req.body || {};

  if (!actorAdminId) {
    return res.status(400).json({
      message: "Admin is required"
    });
  }

  try {
    const [noticeRows, adminRows] = await Promise.all([
      query("SELECT notice_id, admin_id FROM notices WHERE notice_id = ? LIMIT 1", [req.params.noticeId]),
      query(`SELECT admin_id, role_type FROM ${ADMIN_TABLE} WHERE admin_id = ? LIMIT 1`, [actorAdminId])
    ]);

    if (noticeRows.length === 0) {
      return res.status(404).json({
        message: "Notice not found"
      });
    }

    if (adminRows.length === 0) {
      return res.status(404).json({
        message: "Admin account not found"
      });
    }

    const notice = noticeRows[0];
    const actor = adminRows[0];
    const isSystemAdmin = String(actor.role_type || "").trim() === "Super Admin";
    const isOwner = Number(notice.admin_id) === Number(actor.admin_id);

    if (!isSystemAdmin && !isOwner) {
      return res.status(403).json({
        message: "You can only delete notices published by your own account"
      });
    }

    const result = await query(
      "DELETE FROM notices WHERE notice_id = ?",
      [req.params.noticeId]
    );

    return res.json({
      message: "Notice deleted successfully"
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to delete notice",
      error: error.message
    });
  }
});

app.get("/api/dashboard/analytics", async (_req, res) => {
  try {
    const [complaintStats, priorityStats, zoneStats, dustbinStats] = await Promise.all([
      query(
        `SELECT status, COUNT(*) AS total
         FROM complaints
         GROUP BY status`
      ),
      query(
        `SELECT priority, COUNT(*) AS total
         FROM complaints
         GROUP BY priority
         ORDER BY CASE priority WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END`
      ),
      query(
        `SELECT COALESCE(u.zone, 'General') AS zone, COUNT(*) AS total
         FROM complaints c
         INNER JOIN users u ON u.user_id = c.user_id
         GROUP BY COALESCE(u.zone, 'General')
         ORDER BY total DESC, zone ASC`
      ),
      query(
        `SELECT COALESCE(dd.zone, 'General') AS zone,
                SUM(CASE WHEN gs.level >= 80 THEN 1 ELSE 0 END) AS full_bins,
                SUM(CASE WHEN gs.level >= 50 AND gs.level < 80 THEN 1 ELSE 0 END) AS warning_bins,
                COUNT(*) AS total_bins
         FROM garbage_status gs
         LEFT JOIN dustbin_devices dd ON dd.sensor_id = gs.sensor_id
         INNER JOIN (
           SELECT sensor_id, MAX(status_id) AS latest_status_id
           FROM garbage_status
           GROUP BY sensor_id
         ) latest ON latest.latest_status_id = gs.status_id
         GROUP BY COALESCE(dd.zone, 'General')
         ORDER BY total_bins DESC, zone ASC`
      )
    ]);

    return res.json({
      complaintsByStatus: complaintStats,
      complaintsByPriority: priorityStats,
      complaintsByZone: zoneStats,
      dustbinsByZone: dustbinStats
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch analytics summary",
      error: error.message
    });
  }
});


app.get("/api/reports/summary", async (_req, res) => {
  try {
    const [residents, complaints, notices, bins] = await Promise.all([
      query("SELECT COUNT(*) AS total FROM users"),
      query(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) AS resolved_total,
                SUM(CASE WHEN escalated = 1 THEN 1 ELSE 0 END) AS escalated_total,
                SUM(CASE WHEN priority = 'High' THEN 1 ELSE 0 END) AS high_priority_total
         FROM complaints`
      ),
      query("SELECT COUNT(*) AS total FROM notices"),
      query(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN level >= 80 THEN 1 ELSE 0 END) AS full_total,
                SUM(CASE WHEN level >= 50 AND level < 80 THEN 1 ELSE 0 END) AS warning_total
         FROM garbage_status gs
         INNER JOIN (
           SELECT sensor_id, MAX(status_id) AS latest_status_id
           FROM garbage_status
           GROUP BY sensor_id
         ) latest ON latest.latest_status_id = gs.status_id`
      )
    ]);

    return res.json({
      generatedAt: new Date().toISOString(),
      residents: residents[0]?.total ?? 0,
      complaints: complaints[0]?.total ?? 0,
      resolvedComplaints: complaints[0]?.resolved_total ?? 0,
      escalatedComplaints: complaints[0]?.escalated_total ?? 0,
      highPriorityComplaints: complaints[0]?.high_priority_total ?? 0,
      notices: notices[0]?.total ?? 0,
      dustbins: bins[0]?.total ?? 0,
      fullDustbins: bins[0]?.full_total ?? 0,
      warningDustbins: bins[0]?.warning_total ?? 0
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch report summary",
      error: error.message
    });
  }
});

app.get("/api/reports/export", async (req, res) => {
  const exportType = String(req.query.type || "summary");

  try {
    let rows = [];
    let fileName = "smart-tole-report.csv";

    if (exportType === "complaints") {
      rows = await query(
        `SELECT c.complaint_id AS complaint_id,
                u.name AS resident_name,
                u.email AS resident_email,
                u.zone AS zone,
                c.category AS category,
                c.priority AS priority,
                c.status AS status,
                c.assigned_committee AS assigned_committee,
                c.due_date AS due_date,
                c.escalated AS escalated,
                c.created_at AS created_at
         FROM complaints c
         INNER JOIN users u ON u.user_id = c.user_id
         ORDER BY c.created_at DESC`
      );
      fileName = "complaints-report.csv";
    } else if (exportType === "residents") {
      rows = await query(
        `SELECT user_id AS resident_id,
                name,
                email,
                phone,
                address,
                house_no AS house_no,
                zone,
                created_at
         FROM users
         ORDER BY name ASC`
      );
      fileName = "residents-report.csv";
    } else if (exportType === "notices") {
      rows = await query(
        `SELECT n.notice_id AS notice_id,
                n.title,
                n.date,
                COALESCE(n.target_zone, 'All Zones') AS target_zone,
                a.name AS published_by,
                n.created_at
         FROM notices n
         INNER JOIN ${ADMIN_TABLE} a ON a.admin_id = n.admin_id
         ORDER BY n.date DESC, n.notice_id DESC`
      );
      fileName = "notices-report.csv";
    } else if (exportType === "dustbins") {
      rows = await query(
        `SELECT gs.sensor_id AS dustbin_id,
                gs.level AS fill_percentage,
                CASE
                  WHEN gs.level <= 0 THEN 'Empty'
                  WHEN gs.level >= 80 THEN 'Full'
                  WHEN gs.level >= 50 THEN 'Warning'
                  ELSE 'Normal'
                END AS status,
                COALESCE(dd.zone, 'General') AS zone,
                dd.location_label AS location_label,
                dd.device_status AS device_status,
                u.name AS assigned_resident,
                gs.timestamp AS reading_time
         FROM garbage_status gs
         LEFT JOIN dustbin_devices dd ON dd.sensor_id = gs.sensor_id
         LEFT JOIN users u ON u.user_id = gs.assigned_user_id
         INNER JOIN (
           SELECT sensor_id, MAX(status_id) AS latest_status_id
           FROM garbage_status
           GROUP BY sensor_id
         ) latest ON latest.latest_status_id = gs.status_id
         ORDER BY gs.sensor_id ASC`
      );
      fileName = "dustbins-report.csv";
    } else {
      const [summary] = await query(
        `SELECT
           (SELECT COUNT(*) FROM users) AS total_residents,
           (SELECT COUNT(*) FROM complaints) AS total_complaints,
           (SELECT COUNT(*) FROM notices) AS total_notices,
           (SELECT COUNT(*) FROM garbage_status gs
             INNER JOIN (
               SELECT sensor_id, MAX(status_id) AS latest_status_id
               FROM garbage_status
               GROUP BY sensor_id
             ) latest ON latest.latest_status_id = gs.status_id) AS monitored_dustbins,
           (SELECT COUNT(*) FROM complaints WHERE status = 'Resolved') AS resolved_complaints,
           (SELECT COUNT(*) FROM complaints WHERE escalated = 1) AS escalated_complaints,
           (SELECT COUNT(*) FROM complaints WHERE priority = 'High') AS high_priority_complaints`
      );
      rows = [summary];
      fileName = "summary-report.csv";
    }

    const csv = toCsv(rows);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
    return res.send(csv);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to export report",
      error: error.message
    });
  }
});

app.get("/api/garbage/latest", async (req, res) => {
  const residentUserId = req.query.userId ? Number(req.query.userId) : null;

  try {
    const rows = await query(
      `SELECT gs.status_id, gs.sensor_id, gs.level, gs.timestamp, gs.assigned_user_id,
              dd.device_status, dd.device_id, reg.last_seen_at
       FROM garbage_status gs
       LEFT JOIN dustbin_devices dd ON dd.sensor_id = gs.sensor_id
       LEFT JOIN iot_device_registry reg ON LOWER(reg.device_id) = LOWER(dd.device_id)
       ${residentUserId ? "WHERE assigned_user_id = ?" : ""}
       ORDER BY gs.status_id DESC
        LIMIT 1`,
      residentUserId ? [residentUserId] : []
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: "No garbage readings found"
      });
    }

    const reading = rows[0];

    return res.json({
      id: reading.status_id,
      binId: reading.sensor_id,
      fillPercentage: reading.level,
      status: getGarbageLevelStatus(reading.level),
      timestamp: reading.timestamp,
      assignedUserId: reading.assigned_user_id,
      deviceStatus: reading.device_status || "Active",
      deviceId: reading.device_id || "",
      lastSeenAt: reading.last_seen_at,
      connectivityStatus: getDeviceConnectivityStatus({
        deviceId: reading.device_id,
        lastSeenAt: reading.last_seen_at,
        deviceStatus: reading.device_status
      })
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch latest garbage status",
      error: error.message
    });
  }
});

app.get("/api/garbage/history", async (_req, res) => {
  try {
    const rows = await query(
      `SELECT reading_id, sensor_id, level, status, recorded_at
       FROM garbage_reading_logs
       ORDER BY reading_id DESC`
    );

    const data = rows.map((reading) => ({
      id: reading.reading_id,
      binId: reading.sensor_id,
      fillPercentage: reading.level,
      status: reading.status || getGarbageLevelStatus(reading.level),
      timestamp: reading.recorded_at
    }));

    return res.json(data);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch garbage history",
      error: error.message
    });
  }
});

app.get("/api/garbage/bins", async (req, res) => {
  const residentUserId = req.query.userId ? Number(req.query.userId) : null;

  try {
    const rows = await query(
      `SELECT gs.status_id, gs.sensor_id, gs.level, gs.timestamp, gs.assigned_user_id,
              u.name AS assigned_user_name, u.house_no, u.address, u.phone, u.email, u.zone AS resident_zone,
              dd.zone AS device_zone, dd.location_label, dd.device_status, dd.installed_at, dd.device_id,
              reg.last_seen_at
       FROM garbage_status gs
       LEFT JOIN users u ON u.user_id = gs.assigned_user_id
       LEFT JOIN dustbin_devices dd ON dd.sensor_id = gs.sensor_id
       LEFT JOIN iot_device_registry reg ON LOWER(reg.device_id) = LOWER(dd.device_id)
       INNER JOIN (
          SELECT sensor_id, MAX(status_id) AS latest_status_id
          FROM garbage_status
         GROUP BY sensor_id
        ) latest ON latest.latest_status_id = gs.status_id
       ${residentUserId ? "WHERE gs.assigned_user_id = ?" : ""}
        ORDER BY gs.sensor_id ASC`,
      residentUserId ? [residentUserId] : []
    );

    const data = rows.map((reading) => ({
      id: reading.status_id,
      binId: reading.sensor_id,
      fillPercentage: reading.level,
      status: getGarbageLevelStatus(reading.level),
      timestamp: reading.timestamp,
      assignedUserId: reading.assigned_user_id,
      assignedUserName: reading.assigned_user_name,
      assignedHouseNo: reading.house_no,
      assignedAddress: reading.address,
      assignedPhone: reading.phone,
      assignedEmail: reading.email,
      zone: reading.device_zone || reading.resident_zone || "General",
      locationLabel: reading.location_label || `Dustbin ${reading.sensor_id}`,
      deviceStatus: reading.device_status || "Active",
      deviceId: reading.device_id || "",
      installedAt: reading.installed_at,
      lastSeenAt: reading.last_seen_at,
      connectivityStatus: getDeviceConnectivityStatus({
        deviceId: reading.device_id,
        lastSeenAt: reading.last_seen_at,
        deviceStatus: reading.device_status
      })
    }));

    return res.json(data);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch dustbins",
      error: error.message
    });
  }
});

app.post("/api/garbage/readings", async (req, res) => {
  let sensorId = String(req.body.binId ?? req.body.sensorId ?? "").trim();
  const level = Number(req.body.fillPercentage ?? req.body.level ?? 50);
  const assignedUserId = Number(req.body.assignedUserId);
  const zone = req.body.zone || "General";
  const locationLabel = req.body.locationLabel || `Dustbin ${sensorId}`;
  const deviceStatus = req.body.deviceStatus || "Active";
  const deviceId = normalizeDeviceId(req.body.deviceId);

  if (Number.isNaN(assignedUserId)) {
    return res.status(400).json({
      message: "Assigned resident is required"
    });
  }

  try {
    if (!sensorId) {
      sensorId = await generateSensorIdForResident(assignedUserId);
    }

    if (!sensorId) {
      return res.status(400).json({
        message: "Unable to generate a sensor ID for the selected resident."
      });
    }

    const existingDustbin = await query(
      "SELECT status_id FROM garbage_status WHERE sensor_id = ? LIMIT 1",
      [String(sensorId)]
    );

    if (existingDustbin.length > 0) {
      return res.status(409).json({
        message: "A dustbin with this sensor ID already exists. Please edit the existing dustbin instead."
      });
    }

    const residents = await query(
      "SELECT user_id, name, email, account_status FROM users WHERE user_id = ? LIMIT 1",
      [assignedUserId]
    );

    if (residents.length === 0) {
      return res.status(404).json({
        message: "Assigned resident not found"
      });
    }

    if (String(residents[0].account_status || "Active") !== "Active") {
      return res.status(400).json({
        message: "Inactive residents cannot be assigned to a dustbin."
      });
    }

    const result = await query(
      "INSERT INTO garbage_status (sensor_id, level, assigned_user_id) VALUES (?, ?, ?)",
      [String(sensorId), level, assignedUserId]
    );

    await attachDeviceToDustbin(String(sensorId), {
      zone,
      locationLabel,
      deviceStatus,
      deviceId
    });

    if (deviceId) {
      await recordIoTDeviceActivity({
        deviceId,
        linkedSensorId: String(sensorId),
        contactType: "manual_link",
        createIfMissing: false
      });
    }

    const resident = residents[0];
    const currentStatus = getGarbageLevelStatus(level);

    await query(
      `INSERT INTO garbage_reading_logs (
        sensor_id, level, status, assigned_user_id, source, device_status
      ) VALUES (?, ?, ?, ?, 'manual', ?)`,
      [String(sensorId), level, currentStatus, assignedUserId, deviceStatus]
    );

    if (resident.email) {
      await sendDustbinAssignmentEmail({
        to: resident.email,
        residentName: resident.name,
        binId: String(sensorId),
        fillPercentage: level,
        status: currentStatus
      });
    }

    await createNotification({
      recipientRole: "resident",
      recipientUserId: assignedUserId,
      type: "dustbin_assigned",
      title: `Dustbin ${sensorId} assigned`,
      message: `Your dustbin status is currently ${currentStatus} at ${level}% fill level.`,
      linkPath: `/resident/garbage-status?bin=${encodeURIComponent(String(sensorId))}`
    });

    if (resident.email && isGarbageAlertStatus(currentStatus)) {
      await sendDustbinAlertEmail({
        to: resident.email,
        residentName: resident.name,
        binId: String(sensorId),
        status: currentStatus,
        fillPercentage: level
      });

      await createNotification({
        recipientRole: "resident",
        recipientUserId: assignedUserId,
        type: "dustbin_alert",
        title: `Dustbin ${sensorId} alert`,
        message: `Dustbin status changed to ${currentStatus} at ${level}% fill level.`,
        linkPath: `/resident/garbage-status?bin=${encodeURIComponent(String(sensorId))}`
      });
    }

    return res.status(201).json({
      message: "Garbage reading created successfully",
      reading: {
        id: result.insertId,
        binId: String(sensorId),
        sensorId: String(sensorId),
        fillPercentage: level,
        status: getGarbageLevelStatus(level),
        assignedUserId
      }
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to create garbage reading",
      error: error.message
    });
  }
});

app.get("/api/iot/devices", async (_req, res) => {
  try {
    const rows = await query(
      `SELECT reg.device_id, reg.last_ip_address, reg.linked_sensor_id, reg.last_contact_type, reg.last_seen_at,
              dd.sensor_id, dd.zone, dd.location_label, dd.device_status,
              gs.assigned_user_id,
              u.name AS resident_name, u.house_no
       FROM iot_device_registry reg
       LEFT JOIN dustbin_devices dd ON dd.device_id = reg.device_id
       LEFT JOIN garbage_status gs ON gs.sensor_id = COALESCE(dd.sensor_id, reg.linked_sensor_id)
       LEFT JOIN users u ON u.user_id = gs.assigned_user_id
       WHERE reg.last_ip_address IS NOT NULL
       ORDER BY reg.last_seen_at DESC, reg.device_id ASC`
    );

    return res.json(
      rows.map((row) => ({
        deviceId: row.device_id,
        lastIpAddress: row.last_ip_address,
        linkedSensorId: row.sensor_id || row.linked_sensor_id || "",
        lastContactType: row.last_contact_type,
        lastSeenAt: row.last_seen_at,
        zone: row.zone || "General",
        locationLabel: row.location_label || "",
        deviceStatus: row.device_status || "Active",
        connectivityStatus: getDeviceConnectivityStatus({
          deviceId: row.device_id,
          lastSeenAt: row.last_seen_at,
          deviceStatus: row.device_status
        }),
        assignedUserId: row.assigned_user_id,
        residentName: row.resident_name || "",
        houseNo: row.house_no || ""
      }))
    );
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch detected IoT devices",
      error: error.message
    });
  }
});

app.get("/api/iot/device-config", async (req, res) => {
  const deviceId = normalizeDeviceId(req.query.deviceId ?? req.headers["x-device-id"]);

  if (!deviceId) {
    return res.status(400).json({
      message: "deviceId is required"
    });
  }

  try {
    await recordIoTDeviceActivity({
      deviceId,
      ipAddress: req.ip,
      contactType: "config_request"
    });

    const rows = await query(
      `SELECT gs.sensor_id, gs.assigned_user_id,
              dd.zone, dd.location_label, dd.device_status, dd.device_id,
              u.name AS resident_name
       FROM dustbin_devices dd
       LEFT JOIN garbage_status gs ON gs.sensor_id = dd.sensor_id
       LEFT JOIN users u ON u.user_id = gs.assigned_user_id
       WHERE LOWER(dd.device_id) = ?
         AND TRIM(COALESCE(dd.sensor_id, '')) <> ''
       LIMIT 1`,
      [deviceId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: "No dustbin is assigned to this IoT device yet."
      });
    }

    const config = rows[0];

    await recordIoTDeviceActivity({
      deviceId,
      ipAddress: req.ip,
      linkedSensorId: config.sensor_id,
      contactType: "config_request"
    });

    return res.json({
      deviceId: config.device_id,
      binId: config.sensor_id,
      sensorId: config.sensor_id,
      assignedUserId: config.assigned_user_id,
      residentName: config.resident_name || "",
      zone: config.zone || "General",
      locationLabel: config.location_label || `Dustbin ${config.sensor_id}`,
      deviceStatus: config.device_status || "Active"
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch IoT device configuration",
      error: error.message
    });
  }
});

app.post("/api/iot/garbage-reading", async (req, res) => {
  const requestedSensorId = String(req.body.binId ?? req.body.sensorId ?? "").trim();
  const deviceId = normalizeDeviceId(req.body.deviceId ?? req.headers["x-device-id"]);
  const level = normalizeGarbageLevel(req.body.fillPercentage ?? req.body.level);
  const zone = String(req.body.zone || "").trim();
  const locationLabel = String(req.body.locationLabel || "").trim();
  const deviceStatus = String(req.body.deviceStatus || "").trim();

  if (!isIoTDeviceAuthorized(req)) {
    return res.status(401).json({
      message: "Unauthorized IoT device request"
    });
  }

  if ((!requestedSensorId && !deviceId) || Number.isNaN(level)) {
    return res.status(400).json({
      message: "deviceId or sensorId/binId and fillPercentage/level are required"
    });
  }

  try {
    if (deviceId) {
      await recordIoTDeviceActivity({
        deviceId,
        ipAddress: req.ip,
        contactType: "reading"
      });
    }

    const lookupSql = requestedSensorId
      ? `SELECT gs.sensor_id, gs.level, gs.assigned_user_id, gs.timestamp,
                u.name AS resident_name, u.email AS resident_email,
                dd.zone AS device_zone, dd.location_label, dd.device_status, dd.device_id
         FROM garbage_status gs
         LEFT JOIN users u ON u.user_id = gs.assigned_user_id
         LEFT JOIN dustbin_devices dd ON dd.sensor_id = gs.sensor_id
         WHERE gs.sensor_id = ?
         LIMIT 1`
      : `SELECT gs.sensor_id, gs.level, gs.assigned_user_id, gs.timestamp,
                u.name AS resident_name, u.email AS resident_email,
                dd.zone AS device_zone, dd.location_label, dd.device_status, dd.device_id
         FROM garbage_status gs
         LEFT JOIN users u ON u.user_id = gs.assigned_user_id
         INNER JOIN dustbin_devices dd ON dd.sensor_id = gs.sensor_id
         WHERE LOWER(dd.device_id) = ?
         LIMIT 1`;

    const rows = await query(lookupSql, [requestedSensorId || deviceId]);

    if (rows.length === 0) {
      return res.status(404).json({
        message: requestedSensorId
          ? "Dustbin not found. Create and assign the dustbin from the admin panel first."
          : "No dustbin is assigned to this IoT device yet. Link the device ID from the admin panel first."
      });
    }

    const dustbin = rows[0];
    const sensorId = String(dustbin.sensor_id);
    const assignedUserId = Number(dustbin.assigned_user_id);
    const previousLevel = normalizeGarbageLevel(dustbin.level);
    const currentStatus = getGarbageLevelStatus(level);
    const effectiveZone = zone || dustbin.device_zone || "General";
    const effectiveLocationLabel =
      locationLabel || dustbin.location_label || `Dustbin ${sensorId}`;
    const effectiveDeviceStatus = deviceStatus || dustbin.device_status || "Active";

    await query(
      "UPDATE garbage_status SET level = ?, timestamp = CURRENT_TIMESTAMP WHERE sensor_id = ?",
      [level, sensorId]
    );

    await upsertDustbinDeviceMetadata(sensorId, {
      zone: effectiveZone,
      locationLabel: effectiveLocationLabel,
      deviceStatus: effectiveDeviceStatus,
      deviceId
    });

    await recordIoTDeviceActivity({
      deviceId: deviceId || dustbin.device_id,
      ipAddress: req.ip,
      linkedSensorId: sensorId,
      contactType: "reading"
    });

    await query(
      `INSERT INTO garbage_reading_logs (
        sensor_id, level, status, assigned_user_id, source, device_status
      ) VALUES (?, ?, ?, ?, 'iot', ?)`,
      [sensorId, level, currentStatus, Number.isNaN(assignedUserId) ? null : assignedUserId, effectiveDeviceStatus]
    );

    if (!Number.isNaN(assignedUserId)) {
      await handleDustbinStatusTransition({
        sensorId,
        level,
        previousLevel,
        assignedUserId,
        residentName: dustbin.resident_name,
        residentEmail: dustbin.resident_email
      });
    }

    return res.status(201).json({
      message: "IoT garbage reading received successfully",
      reading: {
        binId: sensorId,
        sensorId,
        fillPercentage: level,
        status: currentStatus,
        assignedUserId: Number.isNaN(assignedUserId) ? null : assignedUserId,
        residentName: dustbin.resident_name || "",
        deviceId: deviceId || dustbin.device_id || null,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to process IoT garbage reading",
      error: error.message
    });
  }
});

async function updateDustbinAssignment({
  lookupSql,
  lookupParams,
  requestedSensorId,
  level,
  assignedUserId,
  zone,
  locationLabel,
  deviceStatus,
  deviceId
}) {
  const existingBins = await query(lookupSql, lookupParams);

  if (existingBins.length === 0) {
    return {
      status: 404,
      body: {
        message: "Dustbin not found"
      }
    };
  }

  const currentBin = existingBins[0];
  const previousAssignedUserId = Number(currentBin.assigned_user_id);
  const currentSensorId = String(currentBin.sensor_id || "").trim();
  let nextSensorId = String(requestedSensorId || currentSensorId).trim();

  if (
    previousAssignedUserId !== assignedUserId &&
    (!nextSensorId || nextSensorId === currentSensorId)
  ) {
    nextSensorId = await generateSensorIdForResident(assignedUserId, currentBin.status_id);
  }

  if (!nextSensorId) {
    nextSensorId = await generateSensorIdForResident(assignedUserId, currentBin.status_id);
  }

  if (!nextSensorId) {
    return {
      status: 400,
      body: {
        message: "Unable to generate a bin ID for the selected resident."
      }
    };
  }

  if (nextSensorId !== currentSensorId) {
    const duplicates = await query(
      "SELECT status_id FROM garbage_status WHERE sensor_id = ? AND status_id <> ? LIMIT 1",
      [nextSensorId, currentBin.status_id]
    );

    if (duplicates.length > 0) {
      return {
        status: 409,
        body: {
          message: "Another dustbin already uses this bin ID."
        }
      };
    }
  }

  const residents = await query(
    "SELECT user_id, name, email, account_status FROM users WHERE user_id = ? LIMIT 1",
    [assignedUserId]
  );

  if (residents.length === 0) {
    return {
      status: 404,
      body: {
        message: "Assigned resident not found"
      }
    };
  }

  if (String(residents[0].account_status || "Active") !== "Active") {
    return {
      status: 400,
      body: {
        message: "Inactive residents cannot be assigned to a dustbin."
      }
    };
  }

  await query(
    "UPDATE garbage_status SET sensor_id = ?, level = ?, assigned_user_id = ?, timestamp = CURRENT_TIMESTAMP WHERE status_id = ?",
    [nextSensorId, level, assignedUserId, currentBin.status_id]
  );

  if (currentSensorId && currentSensorId !== nextSensorId) {
    await query(
      "UPDATE iot_device_registry SET linked_sensor_id = ? WHERE linked_sensor_id = ?",
      [nextSensorId, currentSensorId]
    );
    await query(
      "UPDATE garbage_reading_logs SET sensor_id = ? WHERE sensor_id = ?",
      [nextSensorId, currentSensorId]
    );
    await query(
      "UPDATE notifications SET link_path = REPLACE(link_path, ?, ?) WHERE link_path LIKE ?",
      [
        encodeURIComponent(currentSensorId),
        encodeURIComponent(nextSensorId),
        `%${encodeURIComponent(currentSensorId)}%`
      ]
    );
  }

  if (currentSensorId) {
    const existingDeviceRows = await query(
      "SELECT sensor_id FROM dustbin_devices WHERE sensor_id = ? LIMIT 1",
      [currentSensorId]
    );

    if (existingDeviceRows.length > 0) {
      await query(
        "UPDATE dustbin_devices SET sensor_id = ? WHERE sensor_id = ?",
        [nextSensorId, currentSensorId]
      );
    }
  }

  await attachDeviceToDustbin(nextSensorId, {
    zone,
    locationLabel: locationLabel || `Dustbin ${nextSensorId}`,
    deviceStatus,
    deviceId
  });

  if (deviceId) {
    await recordIoTDeviceActivity({
      deviceId,
      linkedSensorId: nextSensorId,
      contactType: "manual_link",
      createIfMissing: false
    });
  }

  const resident = residents[0];
  const currentStatus = getGarbageLevelStatus(level);

  await query(
    `INSERT INTO garbage_reading_logs (
      sensor_id, level, status, assigned_user_id, source, device_status
    ) VALUES (?, ?, ?, ?, 'manual', ?)`,
    [nextSensorId, level, currentStatus, assignedUserId, deviceStatus]
  );

  if (resident.email && Number(previousAssignedUserId) !== assignedUserId) {
    await sendDustbinAssignmentEmail({
      to: resident.email,
      residentName: resident.name,
      binId: nextSensorId,
      fillPercentage: level,
      status: currentStatus
    });

    await createNotification({
      recipientRole: "resident",
      recipientUserId: assignedUserId,
      type: "dustbin_assigned",
      title: `Dustbin ${nextSensorId} assigned`,
      message: `A dustbin was assigned to your household. Current status: ${currentStatus}.`,
      linkPath: `/resident/garbage-status?bin=${encodeURIComponent(nextSensorId)}`
    });
  }

  if (resident.email && isGarbageAlertStatus(currentStatus)) {
    await sendDustbinAlertEmail({
      to: resident.email,
      residentName: resident.name,
      binId: nextSensorId,
      status: currentStatus,
      fillPercentage: level
    });

    await createNotification({
      recipientRole: "resident",
      recipientUserId: assignedUserId,
      type: "dustbin_alert",
      title: `Dustbin ${nextSensorId} alert`,
      message: `Dustbin status changed to ${currentStatus} at ${level}% fill level.`,
      linkPath: `/resident/garbage-status?bin=${encodeURIComponent(nextSensorId)}`
    });
  }

  return {
    status: 200,
    body: {
      message: "Dustbin updated successfully"
    }
  };
}

async function removeDustbinArtifactsBySensorIds(sensorIds) {
  const normalizedSensorIds = Array.from(
    new Set(
      (sensorIds || [])
        .map((sensorId) => String(sensorId || "").trim())
        .filter(Boolean)
    )
  );

  if (normalizedSensorIds.length === 0) {
    return;
  }

  await Promise.all(
    normalizedSensorIds.map((sensorId) =>
      query(
        "UPDATE iot_device_registry SET linked_sensor_id = NULL WHERE linked_sensor_id = ?",
        [sensorId]
      )
    )
  );

  await Promise.all(
    normalizedSensorIds.map((sensorId) =>
      query("DELETE FROM dustbin_devices WHERE sensor_id = ?", [sensorId])
    )
  );

  await Promise.all(
    normalizedSensorIds.map((sensorId) =>
      query("DELETE FROM garbage_reading_logs WHERE sensor_id = ?", [sensorId])
    )
  );

  await Promise.all(
    normalizedSensorIds.map((sensorId) =>
      query(
        "DELETE FROM notifications WHERE link_path LIKE ? OR link_path LIKE ?",
        [`%/resident/garbage-status?bin=${sensorId}%`, `%/admin/garbage-monitoring?bin=${sensorId}%`]
      )
    )
  );
}

async function deleteDustbinsForResident(residentId) {
  const dustbins = await query(
    "SELECT status_id, sensor_id FROM garbage_status WHERE assigned_user_id = ?",
    [residentId]
  );

  if (dustbins.length === 0) {
    return {
      deletedCount: 0
    };
  }

  const sensorIds = dustbins
    .map((dustbin) => String(dustbin.sensor_id || "").trim())
    .filter(Boolean);

  await removeDustbinArtifactsBySensorIds(sensorIds);

  await query(
    "DELETE FROM garbage_status WHERE assigned_user_id = ?",
    [residentId]
  );

  return {
    deletedCount: dustbins.length
  };
}

async function releaseDustbinAssignmentsForResident(residentId) {
  const rows = await query(
    "SELECT sensor_id FROM garbage_status WHERE assigned_user_id = ?",
    [residentId]
  );

  if (rows.length === 0) {
    return {
      releasedCount: 0
    };
  }

  await query(
    "UPDATE garbage_status SET assigned_user_id = NULL, timestamp = CURRENT_TIMESTAMP WHERE assigned_user_id = ?",
    [residentId]
  );

  await query(
    `DELETE FROM notifications
     WHERE recipient_role = 'resident'
       AND recipient_user_id = ?
       AND notification_type IN ('dustbin_assigned', 'dustbin_alert')`,
    [residentId]
  );

  return {
    releasedCount: rows.length
  };
}

async function cleanupOrphanedResidentDustbins() {
  const orphanedRows = await query(
    `SELECT DISTINCT gs.sensor_id
     FROM garbage_status gs
     LEFT JOIN users u ON u.user_id = gs.assigned_user_id
     WHERE gs.assigned_user_id IS NULL
        OR u.user_id IS NULL`
  );

  const sensorIds = orphanedRows
    .map((row) => String(row.sensor_id || "").trim())
    .filter(Boolean);

  if (sensorIds.length === 0) {
    return 0;
  }

  await removeDustbinArtifactsBySensorIds(sensorIds);

  await Promise.all(
    sensorIds.map((sensorId) =>
      query("DELETE FROM garbage_status WHERE sensor_id = ?", [sensorId])
    )
  );

  return sensorIds.length;
}

async function deleteDustbinAssignment({ lookupSql, lookupParams }) {
  const rows = await query(lookupSql, lookupParams);

  if (rows.length === 0) {
    return {
      status: 404,
      body: {
        message: "Dustbin not found"
      }
    };
  }

  const dustbin = rows[0];
  const sensorId = String(dustbin.sensor_id || "").trim();

  if (sensorId) {
    await query(
      "UPDATE iot_device_registry SET linked_sensor_id = NULL WHERE linked_sensor_id = ?",
      [sensorId]
    );
  }

  await query(
    "DELETE FROM garbage_status WHERE status_id = ?",
    [dustbin.status_id]
  );

  if (sensorId) {
    await query(
      "DELETE FROM dustbin_devices WHERE sensor_id = ?",
      [sensorId]
    );
  }

  return {
    status: 200,
    body: {
      message: "Dustbin deleted successfully"
    }
  };
}

app.patch("/api/garbage/bins/:binId", async (req, res) => {
  const level = Number(req.body.fillPercentage ?? req.body.level);
  const assignedUserId = Number(req.body.assignedUserId);
  const requestedSensorId = String(req.body.binId ?? req.body.sensorId ?? req.params.binId).trim();
  const zone = req.body.zone || "General";
  const locationLabel = req.body.locationLabel || `Dustbin ${requestedSensorId || req.params.binId}`;
  const deviceStatus = req.body.deviceStatus || "Active";
  const deviceId = normalizeDeviceId(req.body.deviceId);

  if (Number.isNaN(level) || Number.isNaN(assignedUserId)) {
    return res.status(400).json({
      message: "Fill percentage and assigned resident are required"
    });
  }

  try {
    const result = await updateDustbinAssignment({
      lookupSql: "SELECT status_id, sensor_id, assigned_user_id FROM garbage_status WHERE sensor_id = ? LIMIT 1",
      lookupParams: [String(req.params.binId)],
      requestedSensorId,
      level,
      assignedUserId,
      zone,
      locationLabel,
      deviceStatus,
      deviceId
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update dustbin",
      error: error.message
    });
  }
});

app.patch("/api/garbage/bins/by-record/:statusId", async (req, res) => {
  const level = Number(req.body.fillPercentage ?? req.body.level);
  const assignedUserId = Number(req.body.assignedUserId);
  const requestedSensorId = String(req.body.binId ?? req.body.sensorId ?? "").trim();
  const zone = req.body.zone || "General";
  const locationLabel = req.body.locationLabel || `Dustbin ${requestedSensorId || req.params.statusId}`;
  const deviceStatus = req.body.deviceStatus || "Active";
  const deviceId = normalizeDeviceId(req.body.deviceId);

  if (Number.isNaN(level) || Number.isNaN(assignedUserId)) {
    return res.status(400).json({
      message: "Fill percentage and assigned resident are required"
    });
  }

  try {
    const result = await updateDustbinAssignment({
      lookupSql: "SELECT status_id, sensor_id, assigned_user_id FROM garbage_status WHERE status_id = ? LIMIT 1",
      lookupParams: [Number(req.params.statusId)],
      requestedSensorId,
      level,
      assignedUserId,
      zone,
      locationLabel,
      deviceStatus,
      deviceId
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update dustbin",
      error: error.message
    });
  }
});

app.delete("/api/garbage/bins/:binId", async (req, res) => {
  try {
    const result = await deleteDustbinAssignment({
      lookupSql: "SELECT status_id, sensor_id FROM garbage_status WHERE sensor_id = ? LIMIT 1",
      lookupParams: [String(req.params.binId)]
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to delete dustbin",
      error: error.message
    });
  }
});

app.delete("/api/garbage/bins/by-record/:statusId", async (req, res) => {
  try {
    const result = await deleteDustbinAssignment({
      lookupSql: "SELECT status_id, sensor_id FROM garbage_status WHERE status_id = ? LIMIT 1",
      lookupParams: [Number(req.params.statusId)]
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to delete dustbin",
      error: error.message
    });
  }
});

async function startServer() {
  try {
    await testDatabaseConnection();
    await ensureDefaultAdminAccount();
    await query(
      `CREATE TABLE IF NOT EXISTS dustbin_devices (
        sensor_id VARCHAR(255) PRIMARY KEY,
        device_id VARCHAR(255) NULL,
        zone VARCHAR(100) DEFAULT 'General',
        location_label VARCHAR(255) DEFAULT NULL,
        device_status VARCHAR(50) DEFAULT 'Active',
        installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    );
    await query(
      `CREATE TABLE IF NOT EXISTS resident_update_history (
        history_id INT AUTO_INCREMENT PRIMARY KEY,
        resident_id INT NOT NULL,
        admin_name VARCHAR(255) NOT NULL,
        action_type VARCHAR(50) NOT NULL,
        details TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    );
    await query(
      `CREATE TABLE IF NOT EXISTS notifications (
        notification_id INT AUTO_INCREMENT PRIMARY KEY,
        recipient_role VARCHAR(20) NOT NULL,
        recipient_user_id INT NULL,
        recipient_admin_id INT NULL,
        notification_type VARCHAR(80) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        link_path VARCHAR(255) NULL,
        is_read TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_notifications_resident (recipient_role, recipient_user_id, is_read, notification_id),
        INDEX idx_notifications_admin (recipient_role, recipient_admin_id, is_read, notification_id)
      )`
    );
    await query(
      `CREATE TABLE IF NOT EXISTS garbage_reading_logs (
        reading_id INT AUTO_INCREMENT PRIMARY KEY,
        sensor_id VARCHAR(255) NOT NULL,
        level INT NOT NULL,
        status VARCHAR(30) NOT NULL,
        assigned_user_id INT NULL,
        source VARCHAR(30) DEFAULT 'manual',
        device_status VARCHAR(50) DEFAULT 'Active',
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_garbage_logs_sensor (sensor_id, reading_id),
        INDEX idx_garbage_logs_user (assigned_user_id, reading_id)
      )`
    );
    await query(
      `CREATE TABLE IF NOT EXISTS iot_device_registry (
        device_id VARCHAR(255) PRIMARY KEY,
        last_ip_address VARCHAR(120) NULL,
        linked_sensor_id VARCHAR(255) NULL,
        last_contact_type VARCHAR(50) DEFAULT 'heartbeat',
        last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`
    );
    await query(
      `CREATE TABLE IF NOT EXISTS password_reset_tokens (
        reset_id INT AUTO_INCREMENT PRIMARY KEY,
        recipient_role VARCHAR(20) NOT NULL,
        recipient_id INT NOT NULL,
        recipient_email VARCHAR(255) NOT NULL,
        token_hash VARCHAR(64) NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        consumed_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_password_reset_lookup (recipient_role, recipient_id),
        INDEX idx_password_reset_expiry (expires_at)
      )`
    );
    await query(
      "DELETE FROM dustbin_devices WHERE TRIM(COALESCE(sensor_id, '')) = ''"
    );
    await ensureColumn("dustbin_devices", "device_id", "VARCHAR(255) NULL");
    await ensureIndex("dustbin_devices", "idx_dustbin_devices_device_id", "UNIQUE INDEX idx_dustbin_devices_device_id (device_id)");
    await ensureColumn("users", "zone", "VARCHAR(100) DEFAULT 'General'");
    await ensureColumn("users", "account_status", "VARCHAR(20) DEFAULT 'Active'");
    await ensureColumn(ADMIN_TABLE, "role_type", "VARCHAR(100) DEFAULT 'Super Admin'");
    await ensureColumn(ADMIN_TABLE, "account_status", "VARCHAR(20) DEFAULT 'Active'");
    await ensureColumn(ADMIN_TABLE, "email", "VARCHAR(255) NULL");
    await ensureColumn(ADMIN_TABLE, "phone", "VARCHAR(50) NULL");
    await ensureColumn(ADMIN_TABLE, "address", "VARCHAR(255) NULL");
    await query(
      `ALTER TABLE complaints
       MODIFY COLUMN category ENUM(
         'Streetlight',
         'Water Supply',
         'Sanitation',
         'Road Damage',
         'Drainage',
         'Garbage Collection',
           'Electricity',
           'Other Streetlight Issue',
           'Security',
           'Noise Disturbance',
           'Public Property Damage',
           'Public Safety Alert',
           'Other Water Supply Issue',
           'Other Drainage Or Road Issue',
           'Other Waste Or Sanitation Issue',
           'Other Public Safety Issue',
           'Other'
         ) NOT NULL`
      );
    await ensureColumn("complaints", "priority", "VARCHAR(30) DEFAULT 'Medium'");
    await ensureColumn("complaints", "escalated", "TINYINT(1) DEFAULT 0");
    await ensureColumn("complaints", "due_date", "DATE NULL");
    await ensureColumn("complaints", "assigned_admin_id", "INT NULL");
    await ensureColumn("complaints", "assigned_committee", "VARCHAR(100) DEFAULT 'General Committee'");
    await ensureColumn("notices", "target_zone", "VARCHAR(120) DEFAULT 'All Zones'");
    const cleanedOrphanedDustbins = await cleanupOrphanedResidentDustbins();
    await ensureForeignKeyReference({
      tableName: "notices",
      constraintName: "fk_notices_admin",
      columnName: "admin_id",
      referencedTableName: ADMIN_TABLE
    });
    await runAutoEscalation();
    setInterval(() => {
      runAutoEscalation().catch((error) => {
        console.error("Auto-escalation job failed:", error.message);
      });
    }, 5 * 60 * 1000);
    console.log("Connected to MySQL database");
    if (cleanedOrphanedDustbins > 0) {
      console.log(`Cleaned ${cleanedOrphanedDustbins} orphaned dustbin record(s).`);
    }

    let currentPort = DEFAULT_PORT;

    function startListening() {
      const server = app.listen(currentPort, () => {
        console.log(`Server running on http://localhost:${currentPort}`);
      });

      server.on("error", (error) => {
        if (error.code === "EADDRINUSE") {
          const busyPort = currentPort;
          currentPort += 1;
          console.warn(`Port ${busyPort} is already in use. Trying port ${currentPort}...`);
          startListening();
          return;
        }

        console.error("Server failed to start:", error.message);
        process.exit(1);
      });
    }

    startListening();
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  }
}

startServer();
