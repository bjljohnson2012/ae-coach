import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenancy";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { sendEmail, passwordChangedEmail } from "@/lib/email";

const Body = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  const ctx = await requireSession();
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: ctx.userId } });
  if (!user || !user.passwordHash) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  const ok = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "Current password is wrong" }, { status: 401 });

  const newHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({
    where: { id: ctx.userId },
    data: { passwordHash: newHash, passwordSetAt: new Date() },
  });

  // Confirmation email (logs to console until SMTP is wired)
  const tmpl = passwordChangedEmail(user.name);
  await sendEmail({ to: user.email, subject: tmpl.subject, text: tmpl.text }, { orgId: user.orgId });

  return NextResponse.json({ ok: true });
}
