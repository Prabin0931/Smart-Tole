/*
 * Project note: Complaint Tracking contains shared frontend helper logic.
 * Centralizing this logic keeps status labels, permissions, dates, and summaries consistent across pages.
 */
export function getTrackingToday() {
  return new Date().toISOString().slice(0, 10);
}

export function getComplaintTrackingFlags(complaint, today = getTrackingToday()) {
  const dueDate = complaint?.due_date ? new Date(complaint.due_date).toISOString().slice(0, 10) : "";
  const isResolved = complaint?.status === "Resolved";
  const isOverdue = Boolean(dueDate && !isResolved && dueDate < today);
  const isDueToday = Boolean(dueDate && !isResolved && dueDate === today);
  const isUrgentReview = Boolean(complaint?.escalated);
  const isOnTrack = Boolean(!isResolved && !isOverdue && !isUrgentReview);

  return {
    dueDate,
    isResolved,
    isOverdue,
    isDueToday,
    isUrgentReview,
    isOnTrack
  };
}

export function summarizeComplaintTracking(complaints, generatedAt = new Date().toISOString(), today = getTrackingToday()) {
  return (Array.isArray(complaints) ? complaints : []).reduce(
    (summary, complaint) => {
      const flags = getComplaintTrackingFlags(complaint, today);

      summary.total += 1;

      if (flags.isResolved) {
        summary.resolved += 1;
      }
      if (flags.isOverdue) {
        summary.overdue += 1;
      }
      if (flags.isDueToday) {
        summary.dueToday += 1;
      }
      if (flags.isUrgentReview) {
        summary.escalated += 1;
      }
      if (flags.isOnTrack) {
        summary.onTrack += 1;
      }

      return summary;
    },
    {
      total: 0,
      resolved: 0,
      overdue: 0,
      dueToday: 0,
      escalated: 0,
      onTrack: 0,
      generatedAt
    }
  );
}

export function matchesComplaintTrackingView(complaint, view, today = getTrackingToday()) {
  if (!view) {
    return true;
  }

  const flags = getComplaintTrackingFlags(complaint, today);

  if (view === "overdue") {
    return flags.isOverdue;
  }
  if (view === "due-today") {
    return flags.isDueToday;
  }
  if (view === "escalated") {
    return flags.isUrgentReview;
  }
  if (view === "on-track") {
    return flags.isOnTrack;
  }
  if (view === "resolved") {
    return flags.isResolved;
  }

  return true;
}
