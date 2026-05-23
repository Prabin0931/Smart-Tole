/*
 * Project note: Auth Storage contains shared frontend helper logic.
 * Centralizing this logic keeps status labels, permissions, dates, and summaries consistent across pages.
 */
const AUTH_STORAGE_KEY = "smart-digital-tole-auth";

export function saveAuthUser(user) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
}

export function getAuthUser() {
  const rawValue = localStorage.getItem(AUTH_STORAGE_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    return null;
  }
}

export function clearAuthUser() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}
