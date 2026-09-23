/**
 * Email service.
 *
 * Resolution order for SMTP config:
 *   1. Per-org SMTP from the recipient's CompanyProfile (if smtpHost set)
 *   2. PLATFORM fallback — first ORG_ADMIN-owned org with SMTP configured
 *      (typically "Ben Johnson AI"). This is the Sales Coach AI default.
 *   3. Global env SMTP_HOST (last-resort, server-level)
 *   4. Console fallback (dev / unwired)
 */
import { prisma } from "@/lib/prisma";

interface SendEmailInput {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}
interface SendEmailOptions {
  orgId?: string;
}

type SmtpSource = "org" | "platform" | "env";

interface ResolvedSmtp {
  host: string;
  port: number;
  secure: boolean;
  user?: string | null;
  pass?: string | null;
  from: string;
  source: SmtpSource;
}

const SELECT_SMTP = {
  smtpHost: true, smtpPort: true, smtpSecure: true,
  smtpUser: true, smtpPass: true, smtpFrom: true,
} as const;

const DEFAULT_FROM = "Sales Coach AI <noreply@benjohnson.ai>";

function buildFromCp(cp: any, source: SmtpSource): ResolvedSmtp {
  return {
    host: cp.smtpHost,
    port: cp.smtpPort ?? 587,
    secure: !!cp.smtpSecure,
    user: cp.smtpUser,
    pass: cp.smtpPass,
    from: cp.smtpFrom ?? DEFAULT_FROM,
    source,
  };
}

async function resolveSmtp(orgId?: string): Promise<ResolvedSmtp | null> {
  // 1. Recipient org's own SMTP
  if (orgId) {
    const cp = await prisma.companyProfile.findUnique({
      where: { orgId },
      select: SELECT_SMTP,
    });
    if (cp?.smtpHost) return buildFromCp(cp, "org");
  }

  // 2. Platform fallback — first ORG_ADMIN-owned org with SMTP configured.
  //    We pick any org that has BOTH an ORG_ADMIN user AND smtpHost set.
  const platformOrg = await prisma.org.findFirst({
    where: {
      users: { some: { role: "ORG_ADMIN" } },
      companyProfile: { smtpHost: { not: null } },
    },
    select: { companyProfile: { select: SELECT_SMTP } },
    orderBy: { createdAt: "asc" },
  });
  if (platformOrg?.companyProfile?.smtpHost) {
    return buildFromCp(platformOrg.companyProfile, "platform");
  }

  // 3. Env
  if (process.env.SMTP_HOST) {
    return {
      host: process.env.SMTP_HOST!,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true" || Number(process.env.SMTP_PORT) === 465,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.SMTP_FROM ?? DEFAULT_FROM,
      source: "env",
    };
  }
  return null;
}

async function buildTransport(cfg: ResolvedSmtp) {
  const nodemailer = await import("nodemailer");
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass ?? "" } : undefined,
  });
}

export async function sendEmail(
  input: SendEmailInput,
  options: SendEmailOptions = {}
): Promise<{ ok: boolean; messageId?: string; via: "smtp" | "console"; source?: SmtpSource; error?: string }> {
  const cfg = await resolveSmtp(options.orgId);
  if (!cfg) {
    console.log("\n=== EMAIL (no SMTP configured) ===");
    console.log("To:", input.to);
    console.log("Subject:", input.subject);
    if (input.text) console.log("\n" + input.text);
    if (input.html) console.log("\n[HTML body, " + input.html.length + " chars]");
    console.log("===================================\n");
    return { ok: true, messageId: "console-stub", via: "console" };
  }
  try {
    const transport = await buildTransport(cfg);
    const info = await transport.sendMail({
      from: cfg.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { ok: true, messageId: info.messageId, via: "smtp", source: cfg.source };
  } catch (err: any) {
    console.error("[email] SMTP send failed:", err);
    return { ok: false, via: "smtp", source: cfg.source, error: err?.message ?? "unknown" };
  }
}

/**
 * Verify SMTP connectivity without sending a real email. Used by the "Test SMTP" button.
 */
export async function verifySmtp(orgId?: string): Promise<{ ok: boolean; source?: SmtpSource; error?: string }> {
  const cfg = await resolveSmtp(orgId);
  if (!cfg) return { ok: false, error: "No SMTP configured (org or env)" };
  try {
    const transport = await buildTransport(cfg);
    await transport.verify();
    return { ok: true, source: cfg.source };
  } catch (err: any) {
    return { ok: false, source: cfg.source, error: err?.message ?? "verify failed" };
  }
}

// ============================================================
// Templates
// ============================================================

/**
 * Friendly duration formatter for end-user copy. Avoids "1440 minutes".
 *   60   → "1 hour"
 *   1440 → "1 day"
 *   7200 → "5 days"
 */
function humanDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/**
 * Brand options used by every transactional email. Pulled from the recipient's
 * org's CompanyProfile + Org record. If the org has its own brand color and
 * logo, we use them; otherwise we fall back to the platform default.
 */
export interface EmailBrand {
  orgName?: string | null;
  brandColor?: string | null;
  brandLogoUrl?: string | null;
}

/**
 * Pick a button background that's both on-brand and AA-readable for white text.
 * Falls back to platform indigo if the org's color is too light or missing.
 */
function safeBrandColor(brandColor: string | null | undefined): string {
  if (!brandColor) return "#1F3C88";
  // Quick contrast check: if the color is very light (high luminance), white
  // text on it would fail AA. Fall back to indigo.
  const hex = brandColor.replace("#", "");
  if (hex.length !== 6) return "#1F3C88";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // Relative luminance per WCAG: 0.2126*R + 0.7152*G + 0.0722*B (normalized).
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (luminance > 0.55) return "#1F3C88"; // too light for white text
  return brandColor;
}

/**
 * Render the email header — uses the org's logo if provided, otherwise a
 * text-only "Sales Coach AI" wordmark on the brand color.
 */
function emailHeader(brand: EmailBrand, subhead: string): string {
  const bg = safeBrandColor(brand.brandColor);
  const orgName = brand.orgName || "Sales Coach AI";
  if (brand.brandLogoUrl) {
    return `<div role="presentation" aria-hidden="true" style="background:${bg}; padding:20px 24px; display:flex; align-items:center; gap:12px;">
      <img src="${brand.brandLogoUrl}" alt="${orgName} logo" style="height:32px; width:auto; max-width:120px; background:#FFFFFF; padding:4px; border-radius:6px;">
      <div>
        <p style="margin:0; color:#FFFFFF; font-weight:700; font-size:18px;">${orgName}</p>
        <p style="margin:2px 0 0; color:#E5E7EB; font-size:13px;">${subhead}</p>
      </div>
    </div>`;
  }
  return `<div role="presentation" aria-hidden="true" style="background:${bg}; padding:20px 24px;">
    <p style="margin:0; color:#FFFFFF; font-weight:700; font-size:18px;">${orgName}</p>
    <p style="margin:2px 0 0; color:#E5E7EB; font-size:13px;">${subhead}</p>
  </div>`;
}

/**
 * ADA / WCAG 2.1 AA-compliant welcome email.
 *
 * Brand-aware: uses the recipient org's brandColor + brandLogoUrl if present.
 * If not, falls back to "Sales Coach AI" with platform indigo.
 *
 * Accessibility decisions:
 *   - `<html lang="en">` — required for screen-reader pronunciation.
 *   - Semantic structure: `<main>`, `<h1>`, `<p>` (no divs masquerading as headings).
 *   - Color contrast: body text #111827 on #FFFFFF = 16.6:1 (AAA). Muted text
 *     #475569 on #FFFFFF = 7.4:1 (AAA). Button uses safeBrandColor() which
 *     falls back if the org's brand fails AA.
 *   - Link text is descriptive — no "click here". Bare URL is also provided
 *     for users whose clients strip buttons.
 *   - Plain-text alternative mirrors HTML structure.
 *   - `role="presentation"` on decorative banner so SR doesn't read it.
 */
export function welcomeEmail(name: string, inviteUrl: string, ttlMinutes: number, brand: EmailBrand = {}) {
  const first = name.split(" ")[0];
  const human = humanDuration(ttlMinutes);
  return {
    subject: "Welcome to Sales Coach AI — set up your account",
    text: `Hi ${first},

You've been invited to Sales Coach AI by your team.

To set your password and start your intake, open this link:
${inviteUrl}

For your security, the link expires in ${human}. If it lapses, ask your director or company admin to resend the invite.

— Sales Coach AI
portal.benjohnson.ai`,
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Welcome to ${brand.orgName || "Sales Coach AI"}</title>
</head>
<body style="margin:0; padding:24px; background:#F5F7FA; color:#111827; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; font-size:16px; line-height:1.5;">
  <main role="main" aria-labelledby="welcome-heading" style="max-width:560px; margin:0 auto; background:#FFFFFF; border-radius:14px; overflow:hidden; box-shadow:0 8px 24px rgba(11,31,58,0.08);">
    ${emailHeader(brand, "portal.benjohnson.ai")}
    <div style="padding:24px;">
      <h1 id="welcome-heading" style="font-size:22px; line-height:1.3; margin:0 0 12px; color:#111827;">Welcome, ${first}.</h1>
      <p style="margin:0 0 16px;">You've been invited to ${brand.orgName || "Sales Coach AI"} by your team. Set your password and complete your intake to get started.</p>
      <p style="margin:24px 0;">
        <a href="${inviteUrl}"
           style="display:inline-block; background:${safeBrandColor(brand.brandColor)}; color:#FFFFFF; text-decoration:underline; font-weight:600; font-size:16px; padding:14px 24px; border-radius:10px; outline:2px solid transparent; outline-offset:2px;">
          Set up your account
        </a>
      </p>
      <p style="margin:0 0 8px; color:#475569; font-size:14px;">For your security, this link expires in ${human}. If it lapses, ask your director or company admin to resend the invite.</p>
      <p style="margin:0; color:#475569; font-size:14px; word-break:break-all;">
        If the button doesn't work, copy this URL into your browser: <a href="${inviteUrl}" style="color:${safeBrandColor(brand.brandColor)}; text-decoration:underline;">${inviteUrl}</a>
      </p>
    </div>
    <div style="padding:16px 24px; border-top:1px solid #E5E7EB; background:#F9FAFB; font-size:13px; color:#475569;">
      <p style="margin:0;">${brand.orgName || "Sales Coach AI"} · portal.benjohnson.ai</p>
    </div>
  </main>
</body>
</html>`,
  };
}

export function passwordChangedEmail(name: string) {
  return {
    subject: "Your Sales Coach AI password was changed",
    text: `Hi ${name.split(" ")[0]},

This is a confirmation that your Sales Coach AI password was changed.

If this was you, no action needed.
If this was not you, sign in and change your password again immediately, or contact your org admin.

— Sales Coach AI
portal.benjohnson.ai`,
  };
}

export function passwordResetByAdminEmail(name: string, resetUrl: string, ttlMinutes: number, byAdmin: string) {
  return {
    subject: "Sales Coach AI — password reset link",
    text: `Hi ${name.split(" ")[0]},

${byAdmin} reset your password at your request. Click below to choose a new one:

${resetUrl}

This link expires in ${ttlMinutes} minutes.

If you didn't request this, contact your org admin.

— Sales Coach AI
portal.benjohnson.ai`,
  };
}

/**
 * Sent immediately after a user activates their account (post-set-password).
 * Different from the welcome/invite email — that one says "click here to set
 * up". This one says "you're in, here's what to do next, and how to get
 * value out of the platform."
 *
 * Role-aware: AEs are pointed at intake. Directors get the leadership intake
 * + 1:1 prep flow. Leaders are pointed at the dashboard.
 *
 * ADA: same standards as welcomeEmail — semantic HTML, AAA contrast, plain-text
 * mirror, descriptive link text, lang attr.
 */
export function activatedEmail(name: string, role: string, startUrl: string, brand: EmailBrand = {}) {
  const first = name.split(" ")[0];
  const appUrl = process.env.APP_URL || "https://portal.benjohnson.ai";
  const fullStart = startUrl.startsWith("http") ? startUrl : `${appUrl}${startUrl}`;
  const brandColor = safeBrandColor(brand.brandColor);
  const orgName = brand.orgName || "Sales Coach AI";

  // Role-tailored "what's next" guidance.
  const guidance = roleGuidance(role);

  return {
    subject: `You're in — welcome to ${orgName}`,
    text: `Hi ${first},

Your account is active. Here's what to do next and how to get the most out of the platform.

What's next
${guidance.nextSteps.map((s) => `  • ${s}`).join("\n")}

What to expect
${guidance.expectations.map((s) => `  • ${s}`).join("\n")}

Tips for getting the most value
${guidance.tips.map((s) => `  • ${s}`).join("\n")}

Pick up here: ${fullStart}

If anything looks off, reply to this email and your administrator will get it.

— ${orgName}`,
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>You're in — welcome to ${orgName}</title>
</head>
<body style="margin:0; padding:24px; background:#F5F7FA; color:#111827; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; font-size:16px; line-height:1.5;">
  <main role="main" aria-labelledby="welcome-heading" style="max-width:600px; margin:0 auto; background:#FFFFFF; border-radius:14px; overflow:hidden; box-shadow:0 8px 24px rgba(11,31,58,0.08);">
    ${emailHeader(brand, "You're activated")}
    <div style="padding:24px;">
      <h1 id="welcome-heading" style="font-size:22px; line-height:1.3; margin:0 0 8px; color:#111827;">You're in, ${first}.</h1>
      <p style="margin:0 0 16px; color:#475569;">${guidance.headline}</p>

      <h2 style="font-size:15px; margin:24px 0 8px; color:${brandColor};">What's next</h2>
      <ul style="margin:0 0 16px; padding-left:20px; color:#111827;">
        ${guidance.nextSteps.map((s) => `<li style="margin:4px 0;">${s}</li>`).join("")}
      </ul>

      <h2 style="font-size:15px; margin:24px 0 8px; color:${brandColor};">What to expect</h2>
      <ul style="margin:0 0 16px; padding-left:20px; color:#111827;">
        ${guidance.expectations.map((s) => `<li style="margin:4px 0;">${s}</li>`).join("")}
      </ul>

      <h2 style="font-size:15px; margin:24px 0 8px; color:${brandColor};">Tips for getting the most value</h2>
      <ul style="margin:0 0 16px; padding-left:20px; color:#111827;">
        ${guidance.tips.map((s) => `<li style="margin:4px 0;">${s}</li>`).join("")}
      </ul>

      <p style="margin:24px 0;">
        <a href="${fullStart}"
           style="display:inline-block; background:${brandColor}; color:#FFFFFF; text-decoration:underline; font-weight:600; font-size:16px; padding:14px 24px; border-radius:10px;">
          ${guidance.ctaLabel}
        </a>
      </p>
      <p style="margin:0; color:#475569; font-size:14px; word-break:break-all;">
        Or paste into your browser: <a href="${fullStart}" style="color:${brandColor}; text-decoration:underline;">${fullStart}</a>
      </p>
    </div>
    <div style="padding:16px 24px; border-top:1px solid #E5E7EB; background:#F9FAFB; font-size:13px; color:#475569;">
      <p style="margin:0;">If anything looks off, reply to this email and your administrator will get it.</p>
    </div>
  </main>
</body>
</html>`,
  };
}

interface RoleGuidance {
  headline: string;
  nextSteps: string[];
  expectations: string[];
  tips: string[];
  ctaLabel: string;
}

function roleGuidance(role: string): RoleGuidance {
  switch (role) {
    case "AE":
      return {
        headline: "Your first stop is the intake wizard. It builds your skill profile and tells your director where to coach you.",
        nextSteps: [
          "Complete the intake wizard (about 10 minutes — you can pause and resume)",
          "Review your skill card once it's synthesized",
          "Check your tasks dashboard for anything assigned to you",
        ],
        expectations: [
          "Intake adapts to your answers — no two AEs see the exact same questions",
          "Your director sees your profile and can leave coaching notes",
          "Skill scores update over time as you complete check-in quizzes",
        ],
        tips: [
          "Be honest in the intake — accuracy beats looking good every time",
          "Open the Help center (top-right) anytime you're stuck",
          "Your intake responses are exportable from your account page",
        ],
        ctaLabel: "Start your intake →",
      };
    case "DIRECTOR":
      return {
        headline: "Your leadership intake unlocks per-AE coaching tailored to how you lead.",
        nextSteps: [
          "Complete your director intake (about 12 minutes)",
          "Review your AE roster and their skill cards",
          "Set up recurring quizzes to keep AE skills fresh",
        ],
        expectations: [
          "AEs you direct will appear automatically as their accounts are created",
          "Monthly review prompts surface in your dashboard's Today panel",
          "Coaching hints adapt to your leadership style + each AE's personality",
        ],
        tips: [
          "Compare AEs side-by-side to spot pattern strengths and gaps",
          "Pin 2-3 high-impact coaching priorities per AE in your 1:1 prep",
          "The platform improves as you log coaching notes — feed it real data",
        ],
        ctaLabel: "Start your leadership intake →",
      };
    case "VP_SALES":
      return {
        headline: "Your dashboard is the center of gravity — director rosters, AE skill heatmaps, monthly review queue.",
        nextSteps: [
          "Review your director roster and their leadership profiles",
          "Check the Today panel for anything blocking your team",
          "Walk through one director's AE compare view to feel the workflow",
        ],
        expectations: [
          "You see directors who report to you, plus every AE under them",
          "Compare Directors helps with promotion and coaching decisions",
          "Forecasting style summaries surface drift across your team",
        ],
        tips: [
          "Use Compare AEs to identify expansion-territory candidates",
          "Skill heatmaps show coaching priorities at a glance",
          "Audit log captures every change — useful for compliance reviews",
        ],
        ctaLabel: "Open your dashboard →",
      };
    case "COMPANY_ADMIN":
      return {
        headline: "You own this org's branding, content, users, and SMTP — all of it lives in your dashboard.",
        nextSteps: [
          "Review your dashboard rosters: VPs, Directors, AEs",
          "Configure SMTP so invitation emails go out in your brand",
          "Verify required skills and sales methodology in Org settings",
        ],
        expectations: [
          "Every user in your org rolls up to you",
          "You can author your own question bank or use the platform default",
          "You can export all your company's data anytime from Org settings",
        ],
        tips: [
          "Set brand colors and logo so the app feels like your company",
          "The question bank duplicates check warns before you create overlap",
          "Use the audit log to spot unusual activity across your org",
        ],
        ctaLabel: "Open your dashboard →",
      };
    default:
      return {
        headline: "Your account is active. Open the dashboard to get oriented.",
        nextSteps: ["Explore the dashboard", "Check your Account page for role permissions"],
        expectations: ["The platform adapts to your role", "Help is always one click away"],
        tips: ["Bookmark the dashboard for quick access"],
        ctaLabel: "Open dashboard →",
      };
  }
}

/**
 * Monday-morning improvement brief. ADA-compliant + brand-aware.
 * Designed to be short, energetic, and actionable — under 60 seconds to read.
 */
export function weeklyBriefEmail(
  name: string,
  brief: {
    greeting: string;
    thisWeek: { focus: string; challenge: string; miniTip: string };
    funFactOrQuote: string;
    closer: string;
  },
  brand: EmailBrand = {},
) {
  const first = name.split(" ")[0];
  const orgName = brand.orgName || "Sales Coach AI";
  const brandColor = safeBrandColor(brand.brandColor);
  const appUrl = process.env.APP_URL || "https://portal.benjohnson.ai";
  const dashboardUrl = `${appUrl}/dashboard`;

  return {
    subject: `${first}, your Monday brief is here ☕`,
    text: `${brief.greeting}

THIS WEEK'S FOCUS
${brief.thisWeek.focus}

THE CHALLENGE
${brief.thisWeek.challenge}

MINI TIP
${brief.thisWeek.miniTip}

${brief.funFactOrQuote ? `\n${brief.funFactOrQuote}\n` : ""}
${brief.closer}

Open your dashboard: ${dashboardUrl}

— ${orgName}

You're getting this because you subscribed to the weekly improvement brief.
Unsubscribe anytime in your account settings.`,
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Monday brief</title>
</head>
<body style="margin:0; padding:24px; background:#F5F7FA; color:#111827; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; font-size:16px; line-height:1.55;">
  <main role="main" aria-labelledby="brief-heading" style="max-width:580px; margin:0 auto; background:#FFFFFF; border-radius:14px; overflow:hidden; box-shadow:0 8px 24px rgba(11,31,58,0.08);">
    ${emailHeader(brand, "Monday brief")}
    <div style="padding:24px;">
      <h1 id="brief-heading" style="font-size:22px; line-height:1.3; margin:0 0 12px; color:${brandColor};">${brief.greeting}</h1>

      <div style="margin:20px 0 12px;">
        <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:${brandColor}; margin-bottom:4px;">This week's focus</div>
        <p style="margin:0; color:#111827;">${brief.thisWeek.focus}</p>
      </div>

      <div style="margin:20px 0 12px; padding:16px; border-radius:10px; background:#FEF3C7; border-left:4px solid #F59E0B;">
        <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#92400E; margin-bottom:4px;">The challenge</div>
        <p style="margin:0; color:#111827;">${brief.thisWeek.challenge}</p>
      </div>

      <div style="margin:20px 0 12px;">
        <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:${brandColor}; margin-bottom:4px;">Mini tip</div>
        <p style="margin:0; color:#111827;">${brief.thisWeek.miniTip}</p>
      </div>

      ${brief.funFactOrQuote ? `
      <div style="margin:20px 0 12px; padding:14px; border-radius:10px; background:#F3F4F6;">
        <p style="margin:0; color:#475569; font-style:italic; font-size:14px;">${brief.funFactOrQuote}</p>
      </div>` : ""}

      <p style="margin:20px 0 0; color:#111827; font-weight:600;">${brief.closer}</p>

      <p style="margin:24px 0 0;">
        <a href="${dashboardUrl}"
           style="display:inline-block; background:${brandColor}; color:#FFFFFF; text-decoration:underline; font-weight:600; font-size:15px; padding:12px 22px; border-radius:10px;">
          Open your dashboard
        </a>
      </p>
    </div>
    <div style="padding:14px 24px; border-top:1px solid #E5E7EB; background:#F9FAFB; font-size:12px; color:#475569;">
      <p style="margin:0;">You're getting this because you subscribed to the weekly improvement brief. Toggle it off in your <a href="${appUrl}/account" style="color:${brandColor};">account settings</a>.</p>
    </div>
  </main>
</body>
</html>`,
  };
}

export function smtpTestEmail() {
  return {
    subject: "Sales Coach AI — SMTP test",
    text: `If you're reading this, your SMTP is working correctly.

— Sales Coach AI
portal.benjohnson.ai`,
  };
}
