/*
 * Project note: Date Time contains shared frontend helper logic.
 * Centralizing this logic keeps status labels, permissions, dates, and summaries consistent across pages.
 */
const NEPAL_TIME_ZONE = "Asia/Kathmandu";

function getDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatNepalDateTime(value) {
  const date = getDate(value);

  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: NEPAL_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date);
}

export function formatNepalDate(value) {
  const date = getDate(value);

  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: NEPAL_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}
