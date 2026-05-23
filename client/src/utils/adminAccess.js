/*
 * Project note: Admin Access contains shared frontend helper logic.
 * Centralizing this logic keeps status labels, permissions, dates, and summaries consistent across pages.
 */
import { ROLE_OPTIONS } from "../data/committeeRoles";

function normalizeRoleType(roleType) {
  const normalizedValue = String(roleType || "").trim();
  const matchedOption = ROLE_OPTIONS.find(
    (option) => option.value === normalizedValue || option.aliases?.includes(normalizedValue)
  );

  return matchedOption?.value || normalizedValue || "Committee Member";
}

export function isSystemAdministrator(authUser) {
  return normalizeRoleType(authUser?.roleType) === "Super Admin";
}

export function canManageCommitteeUsers(authUser) {
  return isSystemAdministrator(authUser);
}

export function canEditResidents(authUser) {
  return isSystemAdministrator(authUser);
}

export function canManageGarbageBins(authUser) {
  const normalizedRole = normalizeRoleType(authUser?.roleType);
  return normalizedRole === "Sanitation Committee" || isSystemAdministrator(authUser);
}

export function canUpdateGarbageBins(authUser) {
  return canManageGarbageBins(authUser);
}

export function canDeleteGarbageBins(authUser) {
  return canManageGarbageBins(authUser);
}

export function getAllowedComplaintModules(authUser) {
  return isSystemAdministrator(authUser) ? null : [];
}

export function getDefaultAdminComplaintsPath(authUser) {
  return "/admin/complaints";
}

function getComplaintAssignedAdminId(complaint) {
  const numericValue = Number(
    complaint?.assigned_admin_id ??
      complaint?.assignedAdminId ??
      complaint?.assigned_adminId ??
      null
  );

  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}

export function filterComplaintsForAdminRole(complaints, authUser) {
  if (!Array.isArray(complaints)) {
    return [];
  }

  if (isSystemAdministrator(authUser)) {
    return complaints;
  }

  const authAdminId = Number(authUser?.id);
  if (!Number.isFinite(authAdminId) || authAdminId <= 0) {
    return [];
  }

  return complaints.filter((complaint) =>
    getComplaintAssignedAdminId(complaint) === authAdminId
  );
}

export function canAccessComplaintRecord(authUser, complaint) {
  if (!complaint) {
    return false;
  }

  if (isSystemAdministrator(authUser)) {
    return true;
  }

  const authAdminId = Number(authUser?.id);
  if (!Number.isFinite(authAdminId) || authAdminId <= 0) {
    return false;
  }

  return getComplaintAssignedAdminId(complaint) === authAdminId;
}
