/**
 * POST /api/orgs/[id]/test-email
 * Sends a test email to the requesting admin using the org's SMTP config (or env fallback).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";
import { sendEmail, verifySmtp, smtpTestEmail } from "@/lib/email";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN");
  if (ctx.role === "COMPANY_ADMIN" && ctx.effectiveOrgId !== params.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // First try a connection-only verify so we surface auth issues fast
  const verify = await verifySmtp(params.id);
  if (!verify.ok) {
    return NextResponse.json({ ok: false, error: verify.error || "SMTP not configured", source: verify.source }, { status: 400 });
  }

  const tmpl = smtpTestEmail();
  const send = await sendEmail(
    { to: ctx.email, subject: tmpl.subject, text: tmpl.text },
    { orgId: params.id }
  );
  if (!send.ok) {
    return NextResponse.json({ ok: false, error: send.error || "Send failed", source: send.source }, { status: 500 });
  }
  return NextResponse.json({ ok: true, source: send.source, sentTo: ctx.email });
}
