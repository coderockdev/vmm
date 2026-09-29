import { cookies } from "next/headers";

export const AUTH_COOKIE = "vmm_session";

export type AppUser = {
  name: string;
  email: string;
  plan: string;
  initial: string;
};

export function getAppUser(): AppUser {
  const name = (process.env.VMM_USER_NAME || "Dev").trim() || "Dev";
  const email = (process.env.VMM_USER_EMAIL || "dev@local").trim() || "dev@local";
  const plan = (process.env.VMM_USER_PLAN || "Plano Local").trim() || "Plano Local";
  const initial = name.charAt(0).toUpperCase();
  return { name, email, plan, initial };
}

export function getAppPassword(): string | null {
  const pwd = process.env.VMM_APP_PASSWORD?.trim();
  return pwd ? pwd : null;
}

/** Token is intentionally simple — app is single-tenant / local-first for now. */
export function sessionTokenFor(password: string | null): string {
  const secret = process.env.VMM_AUTH_SECRET?.trim() || "vmm-local-dev";
  const material = `${secret}|${password ?? "open"}|${getAppUser().email}`;
  // Edge-safe base64url (middleware runs on the Edge runtime).
  if (typeof Buffer !== "undefined") {
    return Buffer.from(material).toString("base64url");
  }
  const bytes = new TextEncoder().encode(material);
  let bin = "";
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function isValidSessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  return token === sessionTokenFor(getAppPassword());
}

export function readSessionFromCookies(): boolean {
  try {
    const jar = cookies();
    return isValidSessionToken(jar.get(AUTH_COOKIE)?.value);
  } catch {
    return false;
  }
}
