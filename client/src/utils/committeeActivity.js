/*
 * Project note: Committee Activity contains shared frontend helper logic.
 * Centralizing this logic keeps status labels, permissions, dates, and summaries consistent across pages.
 */
import { getRoleLabel } from "../data/committeeRoles";
import { getTrackingToday, summarizeComplaintTracking } from "./complaintTracking";
import { getGarbageDisplayState } from "./garbageStatus";

export function getAssignedAdminId(complaint) {
  const numericValue = Number(
    complaint?.assigned_admin_id ??
      complaint?.assignedAdminId ??
      complaint?.assigned_adminId ??
      null
  );

  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}

export function isSanitationCommitteeRole(roleType) {
  const normalizedRole = String(roleType || "").trim();
  return normalizedRole === "Sanitation Committee" || getRoleLabel(normalizedRole) === "Waste & Sanitation Committee";
}

export function isSameTrackingDay(value, today = getTrackingToday()) {
  if (!value) {
    return false;
  }

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  return new Date(timestamp).toISOString().slice(0, 10) === today;
}

export function getCommitteeActivityStatus(user, summary) {
  const activeCount = Math.max((summary?.total || 0) - (summary?.resolved || 0), 0);
  const isInactiveAccount = String(user?.accountStatus || "Active").trim() === "Inactive";

  if (isInactiveAccount) {
    return {
      label: "Inactive",
      className: "pill pill-muted"
    };
  }

  if ((summary?.overdue || 0) > 0) {
    return {
      label: "Overdue",
      className: "pill pill-danger"
    };
  }

  if ((summary?.dueToday || 0) > 0) {
    return {
      label: "Due Today",
      className: "pill pill-info"
    };
  }

  if ((summary?.escalated || 0) > 0) {
    return {
      label: "Urgent",
      className: "pill pill-pending"
    };
  }

  if ((summary?.onTrack || 0) > 0) {
    return {
      label: "On Time",
      className: "pill pill-in-progress"
    };
  }

  if (activeCount === 0 && (summary?.resolved || 0) > 0) {
    return {
      label: "Done",
      className: "pill pill-resolved"
    };
  }

  return {
    label: "No Work",
    className: "pill pill-muted"
  };
}

export function buildCommitteeActivityCard(user, complaints, notices, dustbins, today = getTrackingToday()) {
  const assignedComplaints = complaints.filter(
    (complaint) => getAssignedAdminId(complaint) === Number(user.id)
  );
  const summary = summarizeComplaintTracking(assignedComplaints);
  const activeCount = Math.max(summary.total - summary.resolved, 0);
  const complaintUpdatesTodayItems = assignedComplaints.filter((complaint) =>
    isSameTrackingDay(complaint.updated_at || complaint.created_at, today)
  );
  const complaintUpdatesToday = complaintUpdatesTodayItems.length;
  const noticesShared = notices.filter((notice) => Number(notice.admin_id) === Number(user.id)).length;
  const noticesTodayItems = notices.filter(
    (notice) =>
      Number(notice.admin_id) === Number(user.id) &&
      isSameTrackingDay(notice.created_at || notice.date, today)
  );
  const noticesToday = noticesTodayItems.length;
  const managesDustbins = isSanitationCommitteeRole(user.roleType);
  const managedBins = managesDustbins ? dustbins.length : 0;
  const attentionBinsItems = managesDustbins
    ? dustbins.filter((bin) => {
        const display = getGarbageDisplayState(bin, bin.status);
        return (
          display.statusLabel === "Warning" ||
          display.statusLabel === "Full" ||
          display.statusLabel === "Disconnected" ||
          display.statusLabel === "Device Not Assigned"
        );
      })
    : [];
  const attentionBins = attentionBinsItems.length;
  const latestComplaintUpdateAt = complaintUpdatesTodayItems.reduce((latest, complaint) => {
    const value = complaint.updated_at || complaint.created_at;
    const timestamp = value ? new Date(value).getTime() : 0;
    return Number.isFinite(timestamp) && timestamp > latest ? timestamp : latest;
  }, 0);
  const latestNoticeTodayAt = noticesTodayItems.reduce((latest, notice) => {
    const value = notice.created_at || notice.date;
    const timestamp = value ? new Date(value).getTime() : 0;
    return Number.isFinite(timestamp) && timestamp > latest ? timestamp : latest;
  }, 0);
  const latestAttentionBinAt = attentionBinsItems.reduce((latest, bin) => {
    const value = bin.updated_at || bin.timestamp || bin.lastSeenAt;
    const timestamp = value ? new Date(value).getTime() : 0;
    return Number.isFinite(timestamp) && timestamp > latest ? timestamp : latest;
  }, 0);
  const latestComplaintTimestamp = assignedComplaints.reduce((latest, complaint) => {
    const value = complaint.updated_at || complaint.created_at;
    const timestamp = value ? new Date(value).getTime() : 0;
    return Number.isFinite(timestamp) && timestamp > latest ? timestamp : latest;
  }, 0);
  const latestNoticeTimestamp = notices.reduce((latest, notice) => {
    if (Number(notice.admin_id) !== Number(user.id)) {
      return latest;
    }

    const value = notice.created_at || notice.date;
    const timestamp = value ? new Date(value).getTime() : 0;
    return Number.isFinite(timestamp) && timestamp > latest ? timestamp : latest;
  }, 0);
  const latestDustbinTimestamp = managesDustbins
    ? dustbins.reduce((latest, bin) => {
        const value = bin.updated_at || bin.timestamp || bin.lastSeenAt;
        const timestamp = value ? new Date(value).getTime() : 0;
        return Number.isFinite(timestamp) && timestamp > latest ? timestamp : latest;
      }, 0)
    : 0;
  const latestActivityAt = Math.max(latestComplaintTimestamp, latestNoticeTimestamp, latestDustbinTimestamp, 0);

  return {
    id: user.id,
    name: user.name,
    roleLabel: getRoleLabel(user.roleType),
    accountStatus: user.accountStatus || "Active",
    total: summary.total,
    active: activeCount,
    resolved: summary.resolved,
    overdue: summary.overdue,
    dueToday: summary.dueToday,
    urgent: summary.escalated,
    onTrack: summary.onTrack,
    complaintUpdatesToday,
    noticesShared,
    noticesToday,
    managedBins,
    attentionBins,
    latestComplaintUpdateAt: latestComplaintUpdateAt > 0 ? new Date(latestComplaintUpdateAt).toISOString() : "",
    latestNoticeTodayAt: latestNoticeTodayAt > 0 ? new Date(latestNoticeTodayAt).toISOString() : "",
    latestAttentionBinAt: latestAttentionBinAt > 0 ? new Date(latestAttentionBinAt).toISOString() : "",
    latestActivityAt: latestActivityAt > 0 ? new Date(latestActivityAt).toISOString() : "",
    activityScaleMax: Math.max(
      activeCount,
      summary.escalated,
      summary.overdue,
      summary.dueToday,
      summary.onTrack,
      complaintUpdatesToday,
      noticesToday,
      attentionBins,
      summary.resolved,
      1
    ),
    status: getCommitteeActivityStatus(user, summary)
  };
}
