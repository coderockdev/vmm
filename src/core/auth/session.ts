import { cookies } from "next/headers";

export const AUTH_COOKIE = "vmm_session";

export type AppUser = {
  name: string;
  email: string;
  plan: string;
  initial: string;
};

export function getAppPassword(): string | null {
  const pwd = process.env.VMM_APP_PASSWORD?.trim();
  return pwd ? pwd : null;
}

/** Comma-separated emails allowed to sign in when a password is set. */
export function listAllowedEmails(): string[] {
  return (process.env.VMM_USERS || "")
    .split(/[,;\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes("@"));
}

export function authRequired(): boolean {
  return Boolean(getAppPassword()) || listAllowedEmails().length > 0;
}

function authSecret(): string {
  return process.env.VMM_AUTH_SECRET?.trim() || "vmm-local-dev";
}

function encodeToken(material: string): string {
  const bytes = new TextEncoder().encode(material);
  let bin = "";
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeToken(token: string): string | null {
  try {
    const pad = token.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(pad);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** Returns the signed-in email, "local" for the open dev session, or null. */
export function emailFromSessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const raw = decodeToken(token);
  const prefix = `${authSecret()}|`;
  if (!raw || !raw.startsWith(prefix)) return null;
  const email = raw.slice(prefix.length).trim().toLowerCase();
  if (!email) return null;
  if (email === "local") return authRequired() ? null : "local";
  const allowed = listAllowedEmails();
  if (allowed.length > 0 && !allowed.includes(email)) return null;
  if (authRequired() && !getAppPassword()) return null;
  return email;
}

/**
 * Open local access when no password is configured.
 * Otherwise the email must be on VMM_USERS and the password must match VMM_APP_PASSWORD.
 */
export function resolveLogin(email: string, password: string): string | null {
  if (!authRequired()) return "local";
  const required = getAppPassword();
  if (!required || password !== required) return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return null;
  const allowed = listAllowedEmails();
  if (allowed.length > 0 && !allowed.includes(normalized)) return null;
  return normalized;
}

export function sessionTokenForEmail(email: string): string {
  return encodeToken(`${authSecret()}|${email}`);
}

export function getAppUser(): AppUser {
  let email = "";
  try {
    const fromCookie = emailFromSessionToken(cookies().get(AUTH_COOKIE)?.value);
    if (fromCookie && fromCookie !== "local") email = fromCookie;
  } catch {
    email = "";
  }
  if (!email) email = (process.env.VMM_USER_EMAIL || "dev@local").trim() || "dev@local";
  const fromEmail = email.includes("@") ? email.split("@")[0] : "";
  const name = fromEmail || (process.env.VMM_USER_NAME || "Dev").trim() || "Dev";
  const plan = (process.env.VMM_USER_PLAN || "Plano Local").trim() || "Plano Local";
  const initial = name.charAt(0).toUpperCase();
  return { name, email, plan, initial };
}

export function isValidSessionToken(token: string | undefined | null): boolean {
  return Boolean(emailFromSessionToken(token));
}

export function readSessionFromCookies(): boolean {
  try {
    const jar = cookies();
    return isValidSessionToken(jar.get(AUTH_COOKIE)?.value);
  } catch {
    return false;
  }
}
