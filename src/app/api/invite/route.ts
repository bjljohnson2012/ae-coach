import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";

const Body = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(["DIRECTOR", "AE"]).default("AE"),
});

function generateToken() {
  return crypto.randomBytes(32).toString("hex"); // 64-char
}
function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function POST(req: Request) {
  const ctx = await requireRole("ORG_ADMIN", "DIRECTOR");
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { email, name, role } = parsed.data;

  // Directors can only invite AEs (not other directors). Org admins can invite either.
  if (ctx.role === "DIRECTOR" && role !== "AE") {
    return NextResponse.json({ error: "Directors can only invite AEs." }, { status: 403 });
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) return NextResponse.json({ error: "User already exists." }, { status: 409 });

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      name,
      role,
      orgId: ctx.effectiveOrgId,
      status: "PENDING",
      invitedById: ctx.userId,
      invitedAt: new Date(),
    },
  });

  // If AE, create their AeProfile shell (director assignment to inviting director)
  if (role === "AE") {
    await prisma.aeProfile.create({
      data: {
        userId: user.id,
        orgId: ctx.effectiveOrgId,
        directorId: ctx.role === "DIRECTOR" ? ctx.userId : null,
      },
    });
  }

  const token = generateToken();
  await prisma.inviteToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  });

  const inviteUrl = `${process.env.APP_URL || "http://localhost:3000"}/set-password/${token}`;

  // v0: log to console. Wire SMTP in DEPLOY.md.
  console.log(`[INVITE] ${email} → ${inviteUrl}`);

  return NextResponse.json({ ok: true, inviteUrl });
}
