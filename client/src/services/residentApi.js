/*
 * Project note: Resident API is a frontend API client for its Smart Tole module.
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

export async function getResidents() {
  const response = await apiFetch("/api/residents");
  return parseResponse(response);
}

export async function getActiveResidents() {
  const response = await apiFetch("/api/residents?status=Active");
  return parseResponse(response);
}

export async function getResidentById(residentId) {
  const residents = await getResidents();
  const resident = residents.find((item) => String(item.id) === String(residentId));

  if (!resident) {
    throw new Error("Resident not found");
  }

  return resident;
}

export async function updateResident(residentId, payload) {
  const response = await apiFetch(`/api/residents/${residentId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseResponse(response);
}

export async function deleteResident(residentId) {
  const response = await apiFetch(`/api/residents/${residentId}`, {
    method: "DELETE"
  });

  return parseResponse(response);
}

export async function deleteResidentWithMeta(residentId, payload) {
  const response = await apiFetch(`/api/residents/${residentId}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseResponse(response);
}

export async function getResidentHistory(residentId) {
  const response = await apiFetch(`/api/residents/${residentId}/history`);
  return parseResponse(response);
}
