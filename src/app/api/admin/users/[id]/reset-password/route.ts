/**
 * POST /api/admin/users/[id]/reset-password
 *
 * Admin-issued password reset. Generates a fresh InviteToken (TTL configurable),
 * sends a reset email if SMTP is wired (else returns the URL inline).
 *
 * Authorization:
 *   - ORG_ADMIN: any user
 *   - COMPANY_ADMIN: users in their org (not other admins / org admins)
 */
import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";
import { sendEmail, passwordResetByAdminEmail } from "@/lib/email";

const TTL_MIN = Number(process.env.RESET_TOKEN_TTL_MINUTES || 60);

function generateToken() { return crypto.randomBytes(32).toString("hex"); }
function hashToken(t: string) { return crypto.createHash("sha256").update(t).digest("hex"); }

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN");
  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (ctx.role === "COMPANY_ADMIN") {
    if (target.orgId !== ctx.effectiveOrgId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (target.role === "ORG_ADMIN" || target.role === "COMPANY_ADMIN") {
      return NextResponse.json({ error: "Company Admins cannot reset other admins." }, { status: 403 });
    }
  }
  if (target.role === "ORG_ADMIN" && ctx.role !== "ORG_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Invalidate any unused tokens for this user
  await prisma.inviteToken.updateMany({
    where: { userId: target.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });

  const token = generateToken();
  const expiresAt = new Date(Date.now() + TTL_MIN * 60 * 1000);
  await prisma.inviteToken.create({
    data: {
      userId: target.id,
      tokenHash: hashToken(token),
      expiresAt,
    },
  });

  const url = `${process.env.APP_URL || "http://localhost:3000"}/set-password/${token}`;
  const tmpl = passwordResetByAdminEmail(target.name, url, TTL_MIN, ctx.name);
  const sent = await sendEmail(
    { to: target.email, subject: tmpl.subject, text: tmpl.text },
    { orgId: target.orgId }
  );

  await prisma.auditLog.create({
    data: {
      orgId: target.orgId,
      actorUserId: ctx.userId,
      action: "USER_INVITED",
      targetType: "User",
      targetId: target.id,
      metadata: { passwordReset: true, ttlMinutes: TTL_MIN, sentVia: sent.via },
    },
  });

  // Always return the URL too — useful when SMTP isn't wired.
  return NextResponse.json({
    ok: true,
    sentVia: sent.via,
    expiresInMinutes: TTL_MIN,
    inviteUrl: url,
  });
}
