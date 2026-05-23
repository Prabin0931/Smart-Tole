/*
 * Project note: Garbage API is a frontend API client for its Smart Tole module.
 * Keep request and response shapes aligned with the Express routes so pages stay thin and predictable.
 */
import { apiFetch } from "./apiBase";

async function parseResponse(response) {
  const raw = await response.text();
  let data = {};

  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      if (!response.ok) {
        throw new Error(`Request failed (${response.status}). The server returned an invalid response.`);
      }

      throw new Error("The server returned an unreadable response.");
    }
  }

  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }

  return data;
}

export async function getLatestGarbageStatus(userId) {
  const search = userId ? `?userId=${userId}` : "";
  const response = await apiFetch(`/api/garbage/latest${search}`);
  return parseResponse(response);
}

export async function getGarbageHistory() {
  const response = await apiFetch("/api/garbage/history");
  return parseResponse(response);
}

export async function getGarbageBins(userId) {
  const search = userId ? `?userId=${userId}` : "";
  const response = await apiFetch(`/api/garbage/bins${search}`);
  return parseResponse(response);
}

export async function getIotDevices() {
  const response = await apiFetch("/api/iot/devices");
  return parseResponse(response);
}

export async function createGarbageReading(payload) {
  const response = await apiFetch("/api/garbage/readings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseResponse(response);
}

export async function updateGarbageBin(bin, payload) {
  const hasBinId = String(bin?.binId || "").trim().length > 0;
  const path = hasBinId
    ? `/api/garbage/bins/${encodeURIComponent(bin.binId)}`
    : `/api/garbage/bins/by-record/${bin.id}`;

  const response = await apiFetch(path, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseResponse(response);
}

export async function deleteGarbageBin(bin) {
  const hasBinId = String(bin?.binId || "").trim().length > 0;
  const path = hasBinId
    ? `/api/garbage/bins/${encodeURIComponent(bin.binId)}`
    : `/api/garbage/bins/by-record/${bin.id}`;

  const response = await apiFetch(path, {
    method: "DELETE"
  });

  return parseResponse(response);
}
