/*
 * Project note: Notice API is a frontend API client for its Smart Tole module.
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

export async function getNotices(zone) {
  const query = zone ? `?zone=${encodeURIComponent(zone)}` : "";
  const response = await apiFetch(`/api/notices${query}`);
  return parseResponse(response);
}

export async function getNoticeZones() {
  const response = await apiFetch("/api/notices/zones");
  return parseResponse(response);
}

export async function createNotice(payload) {
  const response = await apiFetch("/api/notices", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseResponse(response);
}

export async function updateNotice(noticeId, payload, actorAdminId) {
  const response = await apiFetch(`/api/notices/${noticeId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ...payload,
      actorAdminId
    })
  });

  return parseResponse(response);
}

export async function deleteNotice(noticeId, actorAdminId) {
  const response = await apiFetch(`/api/notices/${noticeId}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      actorAdminId
    })
  });

  return parseResponse(response);
}
