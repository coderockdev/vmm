import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  resolveLogin,
  sessionTokenForEmail,
} from "../../../../core/auth/session";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const password = String(body.password ?? "");
  const email = String(body.email ?? "");
  const who = resolveLogin(email, password);

  if (!who) {
    return NextResponse.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, email: who === "local" ? null : who });
  res.cookies.set(AUTH_COOKIE, sessionTokenForEmail(who), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
