/*
 * Project note: Password hashing and comparison helpers.
 * The bcrypt path is preferred, while the plain-text fallback exists only to keep old academic demo data usable.
 */
import bcrypt from "bcryptjs";

function normalizeHash(value) {
  if (!value) {
    return "";
  }

  if (value.startsWith("$2y$")) {
    return `$2a$${value.slice(4)}`;
  }

  return value;
}

export function looksLikeBcryptHash(value) {
  return typeof value === "string" && /^\$2[aby]\$/.test(value);
}

export async function hashPassword(plainPassword) {
  // New passwords are never stored as plain text; bcrypt stores a salted hash.
  return bcrypt.hash(plainPassword, 10);
}

export async function comparePassword(plainPassword, storedPassword) {
  if (!storedPassword) {
    return false;
  }

  if (looksLikeBcryptHash(storedPassword)) {
    // Normal login path: compare the input password with the saved bcrypt hash.
    return bcrypt.compare(plainPassword, normalizeHash(storedPassword));
  }

  // Backward compatibility for old demo records that may still contain plain text.
  return plainPassword === storedPassword;
}
