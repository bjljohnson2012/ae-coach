import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// PUBLIC_PATHS = endpoints reachable without a NextAuth session.
//   /login, /set-password           — UI pages for unauthed users
//   /api/auth                       — NextAuth's own callback routes
//   /api/set-password               — POST target of the activation form (token-authed, not session-authed)
//   /quiz                           — token-based quiz runner UI
//   /api/quiz                       — token-based quiz submit/fetch
//   /_next, /favicon.ico, /api/health — infra
const PUBLIC_PATHS = [
  "/login",
  "/set-password",
  "/api/auth",
  "/api/set-password",
  "/quiz",
  "/api/quiz",
  "/_next",
  "/favicon.ico",
  "/api/health",
];

// These GETs insert or update rows. Every other GET stays readable while frozen.
const WRITE_CRON_GETS = ["/api/cron/run-quiz-schedules", "/api/cron/run-weekly-briefs"];

function pathIs(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isLoginPath(pathname: string): boolean {
  return pathIs(pathname, "/login") || pathIs(pathname, "/api/auth");
}

function isStaticAssetPath(pathname: string): boolean {
  return (
    pathIs(pathname, "/_next/static") ||
    pathIs(pathname, "/_next/image") ||
    pathname === "/favicon.ico" ||
    pathIs(pathname, "/public")
  );
}

/**
 * Runtime read. `next build` inlines `process.env.AE_WRITES_FROZEN` from the
 * image build, which does not set the flag. The operator turns it on later,
 * in the same step as stopping the cron sidecar, without rebuilding.
 */
export function aeWritesFrozen(): boolean {
  return process.env["AE_WRITES_FROZEN"] === "1";
}

/** True when this request must 503. Login, other GETs, and static assets do not. */
export function requestBlockedByWriteFreeze(method: string, pathname: string): boolean {
  if (!aeWritesFrozen()) return false;
  if (isLoginPath(pathname) || isStaticAssetPath(pathname)) return false;
  const normalized = method.toUpperCase();
  if (normalized === "GET" && WRITE_CRON_GETS.some((p) => pathIs(pathname, p))) return true;
  return normalized !== "GET";
}

function frozenWritesResponse(): NextResponse {
  return NextResponse.json(
    { error: "AE writes are frozen" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (requestBlockedByWriteFreeze(req.method, pathname)) {
    return frozenWritesResponse();
  }

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Impersonation bypass — when an ORG_ADMIN impersonates a lower-role user,
  // a cookie (impersonate_uid) is set. The server-side `getSessionOrNull` swaps
  // role to the target user's role, but the JWT token still says ORG_ADMIN.
  // Without this bypass, the middleware role-checks (which read the raw token)
  // disagree with the server-rendered pages (which use the swapped context),
  // causing an infinite redirect loop. While impersonating, we trust the page
  // layer to enforce access — middleware just lets the request through.
  if (req.cookies.get("impersonate_uid")?.value) {
    return NextResponse.next();
  }

  const role = (token as any).role as
    | "ORG_ADMIN"
    | "COMPANY_ADMIN"
    | "VP_SALES"
    | "DIRECTOR"
    | "AE"
    | undefined;

  // /admin/* → ORG_ADMIN, COMPANY_ADMIN
  if (pathname.startsWith("/admin")) {
    if (role !== "ORG_ADMIN" && role !== "COMPANY_ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }
  // /vp/* → VP_SALES, COMPANY_ADMIN, ORG_ADMIN
  if (pathname.startsWith("/vp")) {
    if (role !== "VP_SALES" && role !== "COMPANY_ADMIN" && role !== "ORG_ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }
  // /director/* → DIRECTOR, VP_SALES, COMPANY_ADMIN, ORG_ADMIN
  if (pathname.startsWith("/director")) {
    if (role === "AE") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }
  // /director/questions/* — ORG_ADMIN + VP_SALES only (v3.9 lockdown)
  if (pathname.startsWith("/director/questions")) {
    if (role !== "ORG_ADMIN" && role !== "VP_SALES") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }
  // /ae/* → AE only
  if (pathname.startsWith("/ae") && role !== "AE") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public).*)"],
};
