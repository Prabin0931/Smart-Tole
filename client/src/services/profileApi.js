/*
 * Project note: Profile API is a frontend API client for its Smart Tole module.
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

export async function getResidentProfile(userId) {
  const response = await apiFetch(`/api/profile/resident/${userId}`);
  return parseResponse(response);
}

export async function updateResidentProfile(userId, payload) {
  const response = await apiFetch(`/api/profile/resident/${userId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseResponse(response);
}

export async function changeResidentPassword(userId, payload) {
  const response = await apiFetch(`/api/profile/resident/${userId}/password`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseResponse(response);
}

export async function getAdminProfile(adminId) {
  const response = await apiFetch(`/api/profile/admin/${adminId}`);
  return parseResponse(response);
}

export async function updateAdminProfile(adminId, payload) {
  const response = await apiFetch(`/api/profile/admin/${adminId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseResponse(response);
}

export async function changeAdminPassword(adminId, payload) {
  const response = await apiFetch(`/api/profile/admin/${adminId}/password`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseResponse(response);
}
