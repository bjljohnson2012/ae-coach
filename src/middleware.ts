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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

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
