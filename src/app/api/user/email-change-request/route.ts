/**
 * POST /api/user/email-change-request
 * User requests an email change. Admin must approve.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenancy";

const Body = z.object({
  requestedEmail: z.string().email(),
});

export async function POST(req: Request) {
  const ctx = await requireSession();
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const requested = parsed.data.requestedEmail.toLowerCase();
  if (requested === ctx.email.toLowerCase()) {
    return NextResponse.json({ error: "Same as current email." }, { status: 400 });
  }
  // Don't allow if email is already taken
  const taken = await prisma.user.findUnique({ where: { email: requested } });
  if (taken) {
    return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
  }

  // Cancel any prior pending request from this user
  await prisma.emailChangeRequest.updateMany({
    where: { userId: ctx.userId, status: "PENDING" },
    data: { status: "REJECTED", rejectionReason: "Superseded by newer request" },
  });

  const ecr = await prisma.emailChangeRequest.create({
    data: {
      userId: ctx.userId,
      currentEmail: ctx.email,
      requestedEmail: requested,
    },
  });
  return NextResponse.json({ ok: true, request: ecr });
}

export async function GET() {
  const ctx = await requireSession();
  const reqs = await prisma.emailChangeRequest.findMany({
    where: { userId: ctx.userId },
    orderBy: { requestedAt: "desc" },
    take: 5,
  });
  return NextResponse.json({ requests: reqs });
}
