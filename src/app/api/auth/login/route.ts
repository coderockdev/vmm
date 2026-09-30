import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  getAppPassword,
  isValidSessionToken,
  sessionTokenFor,
} from "../../../../core/auth/session";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const password = String(body.password ?? "");
  const required = getAppPassword();

  if (required && password !== required) {
    return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, sessionTokenFor(required), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
