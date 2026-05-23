/*
 * Project note: Complaint API is a frontend API client for its Smart Tole module.
 * Keep request and response shapes aligned with the Express routes so pages stay thin and predictable.
 */
import { apiFetch } from "./apiBase";

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const rawBody = await response.text();
  const data = contentType.includes("application/json")
    ? JSON.parse(rawBody)
    : { message: rawBody || "Request failed" };

  if (!response.ok) {
    const detail = data.error ? `${data.message || "Request failed"}: ${data.error}` : data.message || "Request failed";
    throw new Error(detail);
  }

  return data;
}

export async function createComplaint(payload) {
  const response = await apiFetch("/api/complaints", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseResponse(response);
}

export async function getResidentComplaints(userId) {
  const response = await apiFetch(`/api/complaints/resident/${userId}`);
  return parseResponse(response);
}

export async function getResidentComplaintById(userId, complaintId) {
  const response = await apiFetch(`/api/complaints/resident/${userId}/${complaintId}`);
  return parseResponse(response);
}

export async function getAllComplaints() {
  const response = await apiFetch("/api/complaints");
  return parseResponse(response);
}

export async function getComplaintById(complaintId) {
  const response = await apiFetch(`/api/complaints/${complaintId}`);
  return parseResponse(response);
}

export async function addComplaintUpdate(complaintId, payload) {
  const response = await apiFetch(`/api/complaints/${complaintId}/updates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseResponse(response);
}

export async function updateComplaint(complaintId, payload) {
  const response = await apiFetch(`/api/complaints/${complaintId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseResponse(response);
}

export async function updateResidentComplaint(userId, complaintId, payload) {
  const response = await apiFetch(`/api/complaints/resident/${userId}/${complaintId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseResponse(response);
}

export async function deleteComplaint(complaintId) {
  const response = await apiFetch(`/api/complaints/${complaintId}`, {
    method: "DELETE"
  });

  return parseResponse(response);
}

export async function getSlaOverview() {
  const response = await apiFetch("/api/sla/complaints/overview");
  return parseResponse(response);
}

export async function runSlaEscalationNow() {
  const response = await apiFetch("/api/sla/complaints/run", {
    method: "POST"
  });
  return parseResponse(response);
}
