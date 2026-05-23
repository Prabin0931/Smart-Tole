/*
 * Project note: Garbage Status contains shared frontend helper logic.
 * Centralizing this logic keeps status labels, permissions, dates, and summaries consistent across pages.
 */
const DEVICE_OFFLINE_TIMEOUT_MS = 2 * 60 * 1000;

export function normalizeGarbageFillPercentage(value) {
  const parsed = Number(value);

  if (Number.isNaN(parsed)) {
    return null;
  }

  return Math.min(100, Math.max(0, Math.round(parsed)));
}

export function getGarbageStatusLabel(fillPercentage, fallbackStatus = "Unknown") {
  const normalizedLevel = normalizeGarbageFillPercentage(fillPercentage);

  if (normalizedLevel === null) {
    return fallbackStatus || "Unknown";
  }

  if (normalizedLevel <= 0) {
    return "Empty";
  }

  if (normalizedLevel >= 80) {
    return "Full";
  }

  if (normalizedLevel >= 50) {
    return "Warning";
  }

  return "Normal";
}

export function getGarbageStatusTone(statusLabel) {
  if (statusLabel === "Device Not Assigned") {
    return "warning";
  }

  if (statusLabel === "Disconnected") {
    return "danger";
  }

  if (statusLabel === "Full") {
    return "danger";
  }

  if (statusLabel === "Warning") {
    return "warning";
  }

  if (statusLabel === "Empty") {
    return "success";
  }

  return "default";
}

export function formatGarbageFillLabel(fillPercentage) {
  const normalizedLevel = normalizeGarbageFillPercentage(fillPercentage);

  if (normalizedLevel === null) {
    return "Level unavailable";
  }

  return `${normalizedLevel}% filled`;
}

export function isGarbageDeviceDisconnected(deviceLike) {
  const explicitConnectivityStatus = String(deviceLike?.connectivityStatus ?? "").trim().toLowerCase();

  if (explicitConnectivityStatus === "disconnected") {
    return true;
  }

  if (
    explicitConnectivityStatus === "connected" ||
    explicitConnectivityStatus === "no device" ||
    explicitConnectivityStatus === "device not assigned"
  ) {
    return false;
  }

  const deviceId = String(deviceLike?.deviceId ?? "").trim();

  if (!deviceId) {
    return false;
  }

  if (String(deviceLike?.deviceStatus ?? "").trim().toLowerCase() === "disconnected") {
    return true;
  }

  const lastSeenAt = deviceLike?.lastSeenAt;

  if (!lastSeenAt) {
    return true;
  }

  const lastSeenTimestamp = new Date(lastSeenAt).getTime();

  if (!Number.isFinite(lastSeenTimestamp)) {
    return true;
  }

  return Date.now() - lastSeenTimestamp > DEVICE_OFFLINE_TIMEOUT_MS;
}

export function isGarbageDeviceUnassigned(deviceLike) {
  const explicitConnectivityStatus = String(deviceLike?.connectivityStatus ?? "").trim().toLowerCase();

  if (explicitConnectivityStatus === "device not assigned" || explicitConnectivityStatus === "no device") {
    return true;
  }

  return !String(deviceLike?.deviceId ?? "").trim();
}

export function getGarbageDisplayState(deviceLike, fallbackStatus = "Unknown") {
  const statusLabel = isGarbageDeviceUnassigned(deviceLike)
    ? "Device Not Assigned"
    : isGarbageDeviceDisconnected(deviceLike)
      ? "Disconnected"
      : getGarbageStatusLabel(deviceLike?.fillPercentage, fallbackStatus);

  return {
    isDeviceUnassigned: statusLabel === "Device Not Assigned",
    isDisconnected: statusLabel === "Disconnected",
    statusLabel,
    statusTone: getGarbageStatusTone(statusLabel),
    fillLabel:
      statusLabel === "Device Not Assigned"
        ? "No device linked"
        : statusLabel === "Disconnected"
          ? "Device offline"
          : formatGarbageFillLabel(deviceLike?.fillPercentage)
  };
}
