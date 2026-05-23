/*
 * Project note: Notification API is a frontend API client for its Smart Tole module.
 * Keep request and response shapes aligned with the Express routes so pages stay thin and predictable.
 */
import { apiFetch } from "./apiBase";

async function parseResponse(response) {
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }

  return data;
}

export async function getNotifications({ role, userId, adminId, limit = 12 }) {
  const params = new URLSearchParams({
    role,
    limit: String(limit)
  });

  if (userId) {
    params.set("userId", String(userId));
  }

  if (adminId) {
    params.set("adminId", String(adminId));
  }

  const response = await apiFetch(`/api/notifications?${params.toString()}`);
  return parseResponse(response);
}

export async function markNotificationRead(notificationId) {
  const response = await apiFetch(`/api/notifications/${notificationId}/read`, {
    method: "PATCH"
  });

  return parseResponse(response);
}

export async function markAllNotificationsRead(payload) {
  const response = await apiFetch("/api/notifications/read-all", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseResponse(response);
}
