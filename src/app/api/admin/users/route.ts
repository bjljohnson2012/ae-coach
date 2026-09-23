/**
 * POST /api/admin/users — create a new user with a chosen role.
 * Generates an InviteToken; logs the link to console for v0 (or sends email when SMTP wired).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";
import { sendEmail, welcomeEmail } from "@/lib/email";

const Body = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["COMPANY_ADMIN", "VP_SALES", "DIRECTOR", "AE"]),
  vpId: z.string().nullable().optional(),
  directorId: z.string().nullable().optional(),
  orgId: z.string().optional(), // ORG_ADMIN can pick org
});

function generateToken() { return crypto.randomBytes(32).toString("hex"); }
function hashToken(token: string) { return crypto.createHash("sha256").update(token).digest("hex"); }

export async function POST(req: Request) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN");
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });

  // Decide which org the new user lands in
  let orgId = parsed.data.orgId ?? ctx.effectiveOrgId;
  if (ctx.role === "COMPANY_ADMIN") orgId = ctx.effectiveOrgId;

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (existing) return NextResponse.json({ error: "Email already in use" }, { status: 409 });

  const name = `${parsed.data.firstName.trim()} ${parsed.data.lastName.trim()}`.trim();

  const user = await prisma.user.create({
    data: {
      email: parsed.data.email.toLowerCase(),
      name,
      role: parsed.data.role,
      orgId,
      vpId: parsed.data.role === "DIRECTOR" ? parsed.data.vpId ?? null : null,
      status: "PENDING",
      invitedById: ctx.userId,
      invitedAt: new Date(),
    },
  });

  if (parsed.data.role === "AE") {
    await prisma.aeProfile.create({
      data: {
        userId: user.id,
        orgId,
        directorId: parsed.data.directorId ?? null,
      },
    });
  }

  const ttlMinutes = Number(process.env.INVITE_TOKEN_TTL_MINUTES || 60 * 24 * 5); // 5 days default
  const token = generateToken();
  await prisma.inviteToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
    },
  });
  const inviteUrl = `${process.env.APP_URL || "http://localhost:3000"}/set-password/${token}`;

  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId: ctx.userId,
      action: "USER_INVITED",
      targetType: "User",
      targetId: user.id,
      metadata: { role: user.role, email: user.email, ttlMinutes },
    },
  });

  // Send the welcome email — uses the org's SMTP config if set (else env, else console).
  // Pass org branding so the email matches the recipient company's look.
  const orgRecord = await prisma.org.findUnique({
    where: { id: orgId },
    select: { name: true, brandColor: true, brandLogoUrl: true },
  });
  const tmpl = welcomeEmail(user.name, inviteUrl, ttlMinutes, {
    orgName: orgRecord?.name,
    brandColor: orgRecord?.brandColor,
    brandLogoUrl: orgRecord?.brandLogoUrl,
  });
  const sent = await sendEmail(
    { to: user.email, subject: tmpl.subject, text: tmpl.text, html: tmpl.html },
    { orgId }
  );

  return NextResponse.json({
    ok: true,
    inviteUrl,
    sentVia: sent.via,
    expiresInMinutes: ttlMinutes,
    user,
  });
}
