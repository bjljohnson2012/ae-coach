/**
 * POST /api/admin/impersonate { userId }       — start impersonation (ORG_ADMIN-only)
 * DELETE /api/admin/impersonate                — exit (works regardless of swapped session)
 *
 * Implementation: cookie-based. We DON'T mutate the JWT (that would require re-signing).
 * Instead, we set an `impersonate_uid` cookie that tenancy.ts reads to swap context.
 *
 * BUG FIX (v3.8): the DELETE handler MUST NOT call requireRole — by the time it runs,
 * tenancy.ts has already swapped the context to the impersonated user, so requireRole
 * fails. Clearing the cookie is always safe (only the user with the cookie can use it),
 * so we authorize via "session must exist" instead.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";

const COOKIE = "impersonate_uid";

const Body = z.object({ userId: z.string() });

export async function POST(req: Request) {
  const ctx = await requireRole("ORG_ADMIN");
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (target.role === "ORG_ADMIN") return NextResponse.json({ error: "Cannot impersonate another Super Admin" }, { status: 400 });
  if (target.id === ctx.userId) return NextResponse.json({ error: "Cannot impersonate yourself" }, { status: 400 });

  await prisma.auditLog.create({
    data: {
      orgId: target.orgId,
      actorUserId: ctx.userId,
      action: "USER_CREATED",
      targetType: "User",
      targetId: target.id,
      metadata: { impersonationStart: true, byEmail: ctx.email, asEmail: target.email },
    },
  });

  const res = NextResponse.json({ ok: true, impersonating: { id: target.id, name: target.name, role: target.role } });
  res.cookies.set(COOKIE, target.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60, // 1 hour
  });
  return res;
}

/**
 * DELETE: Authorize by raw NextAuth session (bypassing the impersonation swap).
 * Works whether or not the cookie is set. Always safe — it just clears the cookie.
 */
export async function DELETE() {
  const rawSession = await getServerSession(authOptions);
  if (!rawSession?.user) {
    // No session at all — clear cookie anyway and return.
    const res = NextResponse.json({ ok: true });
    res.cookies.delete(COOKIE);
    return res;
  }
  const u = rawSession.user as any;

  await prisma.auditLog.create({
    data: {
      orgId: null,
      actorUserId: u.id,
      action: "USER_CREATED",
      targetType: "User",
      targetId: u.id,
      metadata: { impersonationEnd: true },
    },
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE);
  return res;
}
