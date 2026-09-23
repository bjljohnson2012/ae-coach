import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { checkPassword } from "@/lib/passwordPolicy";
import { sendEmail, activatedEmail } from "@/lib/email";

const Body = z.object({
  token: z.string().min(10),
  password: z.string(),
  name: z.string().optional(),
});

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Where each role lands first after activation. Picks something actionable
 * (intake wizard, dashboard, etc.) instead of dropping them on /login again.
 */
function roleStartUrl(role: string): string {
  switch (role) {
    case "AE":            return "/ae/intake";
    case "DIRECTOR":      return "/director/intake";
    case "VP_SALES":      return "/dashboard";
    case "COMPANY_ADMIN": return "/dashboard";
    case "ORG_ADMIN":     return "/dashboard";
    default:              return "/dashboard";
  }
}

export async function POST(req: Request) {
  // Wrap the whole handler so unhandled exceptions surface as a structured
  // JSON error instead of an empty 500 — which made the previous bug look
  // like "Could not set password" with no detail.
  try {
    let parsed;
    try {
      parsed = Body.safeParse(await req.json());
    } catch {
      return NextResponse.json(
        { error: "Could not read your form data. Refresh and try again." },
        { status: 400 }
      );
    }
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Request was malformed. Refresh and try again.", zod: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { token, password, name } = parsed.data;

    // Same checklist the UI uses, return the specific failure so the client
    // never shows "all green" while the server rejects.
    const check = checkPassword(password);
    if (!check.ok) {
      return NextResponse.json({ error: check.message, failures: check.failures }, { status: 400 });
    }

    const tokenHash = hashToken(token);
    const invite = await prisma.inviteToken.findUnique({ where: { tokenHash } });
    if (!invite) {
      return NextResponse.json(
        { error: "This invite link is invalid. Ask your administrator to resend the invite." },
        { status: 400 }
      );
    }
    if (invite.usedAt) {
      return NextResponse.json(
        { error: "This invite link has already been used. Sign in at /login or ask for a fresh link." },
        { status: 400 }
      );
    }
    if (invite.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "This invite link has expired. Ask your administrator to resend the invite." },
        { status: 400 }
      );
    }

    // Sanity check the user still exists. Catches the rare case where an admin
    // deleted the user between sending the invite and the recipient clicking it.
    const user = await prisma.user.findUnique({ where: { id: invite.userId } });
    if (!user) {
      return NextResponse.json(
        { error: "Your account no longer exists. Ask your administrator for a fresh invite." },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(password);

    const finalName = name && name.trim() ? name.trim() : user.name;

    await prisma.$transaction([
      prisma.user.update({
        where: { id: invite.userId },
        data: {
          passwordHash,
          passwordSetAt: new Date(),
          status: "ACTIVE",
          ...(name && name.trim() ? { name: name.trim() } : {}),
        },
      }),
      prisma.inviteToken.update({
        where: { id: invite.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // Pick the right "first stop" for this role so the client can redirect
    // straight into action after auto-login.
    const startUrl = roleStartUrl(user.role);

    // Fire-and-forget congrats email so a failure here doesn't block activation.
    // Pull org branding so the email matches the recipient company.
    const orgRecord = await prisma.org.findUnique({
      where: { id: user.orgId },
      select: { name: true, brandColor: true, brandLogoUrl: true },
    });
    const tmpl = activatedEmail(finalName, user.role, startUrl, {
      orgName: orgRecord?.name,
      brandColor: orgRecord?.brandColor,
      brandLogoUrl: orgRecord?.brandLogoUrl,
    });
    sendEmail(
      { to: user.email, subject: tmpl.subject, text: tmpl.text, html: tmpl.html },
      { orgId: user.orgId },
    ).catch((err) => console.error("[set-password] activated-email send failed:", err));

    // Return the credentials the client needs to call signIn() and route to.
    return NextResponse.json({
      ok: true,
      email: user.email,
      role: user.role,
      startUrl,
    });
  } catch (err: any) {
    // Log the full error server-side for debugging, but return a user-safe
    // message so we don't leak internals in production.
    console.error("[set-password] unhandled error:", err);
    return NextResponse.json(
      {
        error: "Something went wrong on our end. Try again in a moment, or ask your administrator to resend the invite.",
        // In dev we expose the actual message — strips itself in production.
        debug: process.env.NODE_ENV === "development" ? String(err?.message ?? err) : undefined,
      },
      { status: 500 }
    );
  }
}
