/*
 * Project note: API Base is a frontend API client for its Smart Tole module.
 * Keep request and response shapes aligned with the Express routes so pages stay thin and predictable.
 */
const API_BASE_STORAGE_KEY = "smart-tole-api-base-url";
const EXPLICIT_API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "").trim();
const FALLBACK_PORTS = [5000, 5001, 5002, 5003, 5004];

let cachedApiBaseUrl = EXPLICIT_API_BASE_URL;

function getBrowserProtocol() {
  if (typeof window === "undefined") {
    return "http:";
  }

  return window.location.protocol === "https:" ? "https:" : "http:";
}

function getHostCandidates() {
  const hosts = new Set(["localhost"]);

  if (typeof window !== "undefined") {
    const hostname = String(window.location.hostname || "").trim();
    if (hostname) {
      hosts.add(hostname);
    }
  }

  return Array.from(hosts);
}

function getStoredApiBaseUrl() {
  if (typeof window === "undefined") {
    return "";
  }

  return String(window.localStorage.getItem(API_BASE_STORAGE_KEY) || "").trim();
}

function rememberApiBaseUrl(value) {
  cachedApiBaseUrl = value;

  if (typeof window !== "undefined") {
    window.localStorage.setItem(API_BASE_STORAGE_KEY, value);
  }
}

function getCandidateBaseUrls() {
  const candidates = new Set();

  // First try the last working API URL, then configured URLs, then common local ports.
  if (cachedApiBaseUrl) {
    candidates.add(cachedApiBaseUrl);
  }

  const storedApiBaseUrl = getStoredApiBaseUrl();
  if (storedApiBaseUrl) {
    candidates.add(storedApiBaseUrl);
  }

  if (EXPLICIT_API_BASE_URL) {
    candidates.add(EXPLICIT_API_BASE_URL);
  }

  const protocol = getBrowserProtocol();

  getHostCandidates().forEach((host) => {
    FALLBACK_PORTS.forEach((port) => {
      candidates.add(`${protocol}//${host}:${port}`);
    });
  });

  return Array.from(candidates);
}

export async function apiFetch(path, options) {
  let lastError = null;

  // The backend may move from 5000 to 5001+ if a port is busy, so each request
  // probes known candidates and remembers the first working server.
  for (const baseUrl of getCandidateBaseUrls()) {
    try {
      const response = await fetch(`${baseUrl}${path}`, options);
      rememberApiBaseUrl(baseUrl);
      return response;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(lastError?.message || "Unable to connect to the API server");
}

export default EXPLICIT_API_BASE_URL || "http://localhost:5000";
