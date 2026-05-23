/*
 * Project note: Central email notification helper for account, complaint, notice, contact, and recovery messages.
 * Local development may run without SMTP; skipped email should not block core system actions.
 */
import nodemailer from "nodemailer";

function isEmailConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.SMTP_FROM_EMAIL
  );
}

function getTransporter() {
  if (!isEmailConfigured()) {
    return null;
  }

  // Transporter is created only when SMTP values exist, so local development can
  // run without email credentials while still logging skipped notifications.
  const smtpHost = String(process.env.SMTP_HOST || "").trim();
  const smtpPort = Number(process.env.SMTP_PORT);
  const smtpUser = String(process.env.SMTP_USER || "").trim();
  // Gmail app passwords are often copied with spaces (xxxx xxxx xxxx xxxx).
  // Remove all spaces to avoid authentication failures.
  const smtpPass = String(process.env.SMTP_PASS || "").replace(/\s+/g, "").trim();
  const smtpSecure =
    process.env.SMTP_SECURE !== undefined
      ? String(process.env.SMTP_SECURE).toLowerCase() === "true"
      : smtpPort === 465;

  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000
  });
}

async function sendEmail({ to, subject, text, html }) {
  const transporter = getTransporter();

  if (!transporter) {
    console.log(`[email:skipped] ${subject} -> ${to}`);
    return { skipped: true };
  }

  await transporter.sendMail({
    from: `"${process.env.SMTP_FROM_NAME || "Smart Digital Tole"}" <${process.env.SMTP_FROM_EMAIL}>`,
    to,
    subject,
    text,
    html
  });

  return { skipped: false };
}

export async function sendComplaintStatusEmail({ to, residentName, complaintCategory, status, note }) {
  return sendEmail({
    to,
    subject: `Complaint Update: ${complaintCategory}`,
    text:
      `Hello ${residentName},\n\n` +
      `Your complaint for ${complaintCategory} has been updated to "${status}".\n\n` +
      `Committee update: ${note}\n\n` +
      `Regards,\nSmart Digital Tole`
  });
}

export async function sendComplaintCreatedResidentEmail({
  to,
  residentName,
  complaintCategory,
  priority,
  dueDate,
  complaintId
}) {
  return sendEmail({
    to,
    subject: `Complaint Submitted: ${complaintCategory}`,
    text:
      `Hello ${residentName},\n\n` +
      `Your complaint has been submitted successfully.\n\n` +
      `Complaint ID: ${complaintId}\n` +
      `Category: ${complaintCategory}\n` +
      `Priority: ${priority}\n` +
      `Current status: Pending\n` +
      `Expected follow-up by: ${dueDate}\n\n` +
      `The committee will review your complaint and update you through the system.\n\n` +
      `Regards,\nSmart Digital Tole`
  });
}

export async function sendComplaintCreatedAdminEmail({
  to,
  committeeName,
  residentName,
  complaintCategory,
  priority,
  dueDate,
  complaintId
}) {
  return sendEmail({
    to,
    subject: `New Complaint Submitted: ${complaintCategory}`,
    text:
      `Hello ${committeeName},\n\n` +
      `A new complaint has been submitted and is waiting for review.\n\n` +
      `Complaint ID: ${complaintId}\n` +
      `Resident: ${residentName}\n` +
      `Category: ${complaintCategory}\n` +
      `Priority: ${priority}\n` +
      `Suggested due date: ${dueDate}\n` +
      `Current status: Pending\n\n` +
      `Please review and assign this complaint from the Smart Digital Tole admin panel.\n\n` +
      `Regards,\nSmart Digital Tole`
  });
}

export async function sendCommitteeAccountUserEmail({
  to,
  userName,
  username,
  roleType,
  password,
  isNewAccount
}) {
  const accountLabel = isNewAccount ? "created" : "updated";
  const passwordLine = password
    ? `Login password: ${password}\nPlease change it after your first login.\n\n`
    : `Login password: Your existing password is still active.\n\n`;

  return sendEmail({
    to,
    subject: isNewAccount ? "Committee Account Created" : "Committee Role Updated",
    text:
      `Hello ${userName},\n\n` +
      `Your Smart Digital Tole committee account has been ${accountLabel}.\n\n` +
      `Login username: ${username}\n` +
      `Assigned role: ${roleType}\n` +
      passwordLine +
      `You can now sign in to the admin/committee portal using these login details.\n\n` +
      `Regards,\nSmart Digital Tole`
  });
}

export async function sendCommitteeAccountAdminEmail({
  to,
  adminName,
  userName,
  username,
  roleType,
  isNewAccount
}) {
  return sendEmail({
    to,
    subject: isNewAccount ? "New Committee User Created" : "Committee User Updated",
    text:
      `Hello ${adminName},\n\n` +
      `A committee account has been ${isNewAccount ? "created" : "updated"} in Smart Digital Tole.\n\n` +
      `User name: ${userName}\n` +
      `Username: ${username}\n` +
      `Assigned role: ${roleType}\n\n` +
      `Please review the committee directory if further coordination is needed.\n\n` +
      `Regards,\nSmart Digital Tole`
  });
}

export async function sendResidentPasswordResetEmail({
  to,
  residentName,
  resetUrl,
  expiresInMinutes = 30
}) {
  return sendEmail({
    to,
    subject: "Resident Password Reset",
    text:
      `Hello ${residentName},\n\n` +
      `We received a request to reset your Smart Digital Tole resident password.\n\n` +
      `Open this link to choose a new password:\n${resetUrl}\n\n` +
      `This link will expire in ${expiresInMinutes} minutes.\n` +
      `If you did not request this, you can safely ignore this email.\n\n` +
      `Regards,\nSmart Digital Tole`
  });
}

export async function sendCommitteePasswordResetEmail({
  to,
  userName,
  roleType,
  resetUrl,
  expiresInMinutes = 30
}) {
  return sendEmail({
    to,
    subject: "Committee Account Password Reset",
    text:
      `Hello ${userName},\n\n` +
      `We received a request to reset your Smart Digital Tole committee password.\n\n` +
      `Role: ${roleType}\n` +
      `Open this link to choose a new password:\n${resetUrl}\n\n` +
      `This link will expire in ${expiresInMinutes} minutes.\n` +
      `If you did not request this, you can safely ignore this email.\n\n` +
      `Regards,\nSmart Digital Tole`
  });
}

export async function sendResidentProfileUpdatedResidentEmail({
  to,
  residentName,
  updatedByName,
  actionTaken,
  changeSummary,
  email,
  phone,
  address,
  houseNo,
  zone
}) {
  const updatedByLine = updatedByName ? `Updated by: ${updatedByName}\n` : "";
  const houseNoLine = houseNo ? `House No: ${houseNo}\n` : "";
  const actionLine = actionTaken ? `Action taken: ${actionTaken}\n` : "";
  const summaryLine = changeSummary ? `Updated items: ${changeSummary}\n\n` : "";

  return sendEmail({
    to,
    subject: actionTaken || "Resident Profile Updated",
    text:
      `Hello ${residentName},\n\n` +
      `Your resident information has been changed in Smart Digital Tole.\n\n` +
      actionLine +
      updatedByLine +
      summaryLine +
      `Email: ${email}\n` +
      `Phone: ${phone}\n` +
      `Address: ${address}\n` +
      houseNoLine +
      `Zone: ${zone || "General"}\n\n` +
      `If you did not expect this update, please contact the admin team.\n\n` +
      `Regards,\nSmart Digital Tole`
  });
}

export async function sendResidentProfileUpdatedAdminEmail({
  to,
  adminName,
  residentName,
  residentEmail,
  phone,
  address,
  houseNo,
  zone,
  updatedByName,
  actionTaken,
  changeSummary
}) {
  const updatedByLine = updatedByName ? `Updated by: ${updatedByName}\n` : "";
  const houseNoLine = houseNo ? `House No: ${houseNo}\n` : "";
  const actionLine = actionTaken ? `Action taken: ${actionTaken}\n` : "";
  const summaryLine = changeSummary ? `Updated items: ${changeSummary}\n\n` : "";

  return sendEmail({
    to,
    subject: actionTaken || "Resident Information Updated",
    text:
      `Hello ${adminName},\n\n` +
      `A resident record has been updated in Smart Digital Tole.\n\n` +
      actionLine +
      updatedByLine +
      summaryLine +
      `Resident: ${residentName}\n` +
      `Email: ${residentEmail}\n` +
      `Phone: ${phone}\n` +
      `Address: ${address}\n` +
      houseNoLine +
      `Zone: ${zone || "General"}\n\n` +
      `Please review the resident directory if follow-up is needed.\n\n` +
      `Regards,\nSmart Digital Tole`
  });
}

export async function sendNoticeEmail({ to, residentName, title, description, date, targetZone }) {
  return sendEmail({
    to,
    subject: `New Notice: ${title}`,
    text:
      `Hello ${residentName},\n\n` +
      `A new community notice has been published.\n\n` +
      `Title: ${title}\nDate: ${date}\nAudience: ${targetZone || "All Zones"}\n\n${description}\n\n` +
      `Regards,\nSmart Digital Tole`
  });
}

export async function sendDustbinAlertEmail({ to, residentName, binId, status, fillPercentage }) {
  return sendEmail({
    to,
    subject: `Dustbin Alert: Bin ${binId} is ${status}`,
    text:
      `Hello ${residentName},\n\n` +
      `Your assigned dustbin (Bin ${binId}) is now at ${fillPercentage}% and marked "${status}".\n\n` +
      `Regards,\nSmart Digital Tole`
  });
}

export async function sendDustbinAssignmentEmail({ to, residentName, binId, fillPercentage, status }) {
  return sendEmail({
    to,
    subject: `Dustbin Assigned: Bin ${binId}`,
    text:
      `Hello ${residentName},\n\n` +
      `A dustbin has been assigned to your household.\n\n` +
      `Bin ID: ${binId}\n` +
      `Current fill level: ${fillPercentage}%\n` +
      `Current status: ${status}\n\n` +
      `You can now view this dustbin in your garbage status page.\n\n` +
      `Regards,\nSmart Digital Tole`
  });
}

export async function sendContactAdminEmail({ to, adminName, fromName, fromEmail, subject, message }) {
  const adminEmail = to || process.env.ADMIN_SUPPORT_EMAIL || process.env.SMTP_FROM_EMAIL;

  if (!adminEmail) {
    console.log("[email:skipped] Contact admin email skipped because ADMIN_SUPPORT_EMAIL is not configured.");
    return { skipped: true };
  }

  return sendEmail({
    to: adminEmail,
    subject: `Contact Admin: ${subject}`,
    text:
      `${adminName ? `Hello ${adminName},\n\n` : ""}` +
      `Resident: ${fromName}\n` +
      `Email: ${fromEmail}\n\n` +
      `${message}`
  });
}

export async function sendContactConfirmationEmail({ to, residentName, subject }) {
  return sendEmail({
    to,
    subject: `We received your message: ${subject}`,
    text:
      `Hello ${residentName},\n\n` +
      `Your message to the committee has been received. The admin team will follow up with you soon.\n\n` +
      `Regards,\nSmart Digital Tole`
  });
}
