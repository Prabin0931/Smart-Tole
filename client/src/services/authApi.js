/*
 * Project note: Auth API is a frontend API client for its Smart Tole module.
 * Keep request and response shapes aligned with the Express routes so pages stay thin and predictable.
 */
import { apiFetch } from "./apiBase";

async function sendRequest(path, payload) {
  const response = await apiFetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }

  return data;
}

export function registerResident(payload) {
  return sendRequest("/api/auth/resident/register", payload);
}

export function loginResident(payload) {
  return sendRequest("/api/auth/resident/login", payload);
}

export function loginAdmin(payload) {
  return sendRequest("/api/auth/admin/login", payload);
}

export function requestResidentPasswordReset(payload) {
  return sendRequest("/api/auth/resident/forgot-password", payload);
}

export function requestAdminPasswordReset(payload) {
  return sendRequest("/api/auth/admin/forgot-password", payload);
}

export function verifyPasswordResetToken(payload) {
  return sendRequest("/api/auth/password-reset/verify", payload);
}

export function completePasswordReset(payload) {
  return sendRequest("/api/auth/password-reset/complete", payload);
}
