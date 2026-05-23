/*
 * Project note: Admin API is a frontend API client for its Smart Tole module.
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

export async function getCommitteeAdmins() {
  const response = await apiFetch("/api/admins");
  return parseResponse(response);
}

export async function createCommitteeAdmin(payload) {
  const response = await apiFetch("/api/admins", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseResponse(response);
}

export async function updateCommitteeAdmin(adminId, payload) {
  const response = await apiFetch(`/api/admins/${adminId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseResponse(response);
}

export async function deleteCommitteeAdmin(adminId) {
  const response = await apiFetch(`/api/admins/${adminId}`, {
    method: "DELETE"
  });

  return parseResponse(response);
}

export async function getAnalyticsSummary() {
  const response = await apiFetch("/api/dashboard/analytics");
  return parseResponse(response);
}

export async function getReportSummary() {
  const response = await apiFetch("/api/reports/summary");
  return parseResponse(response);
}

export async function downloadReport(type) {
  const response = await apiFetch(`/api/reports/export?type=${encodeURIComponent(type)}`);

  if (!response.ok) {
    let message = "Failed to export report";
    try {
      const data = await response.json();
      message = data.message || message;
    } catch {
      message = "Failed to export report";
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  const typeLabel = type || "summary";
  link.href = url;
  link.download = `${typeLabel}-report.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
