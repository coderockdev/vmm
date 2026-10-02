import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, isValidSessionToken } from "./core/auth/session";

const PUBLIC_PREFIXES = ["/login", "/api/auth/login", "/api/cron", "/_next", "/favicon", "/reference"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (pathname === "/login" && isValidSessionToken(req.cookies.get(AUTH_COOKIE)?.value)) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  if (/\.(png|jpg|jpeg|gif|webp|svg|ico|mp3|mp4|css|js|map)$/i.test(pathname)) {
    return NextResponse.next();
  }

  // API auth/logout must remain reachable while logged in; login already public.
  if (pathname === "/api/auth/logout") {
    return NextResponse.next();
  }

  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (isValidSessionToken(token)) {
    return NextResponse.next();
  }

  // Keep API usable for unauthenticated health checks? Prefer redirect for pages only.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname === "/" ? "/" : pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
