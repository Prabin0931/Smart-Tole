/*
 * Project note: Contact API is a frontend API client for its Smart Tole module.
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
    throw new Error(data.message || "Request failed");
  }

  return data;
}

export async function contactAdmin(payload) {
  const response = await apiFetch("/api/contact-admin", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseResponse(response);
}
