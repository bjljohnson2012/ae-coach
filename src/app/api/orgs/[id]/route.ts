import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";

// Logo URL: relative path or absolute URL or empty/null.
const logoUrlSchema = z
  .string()
  .max(2048)
  .refine(
    (v) => v === "" || v.startsWith("/") || /^https?:\/\//.test(v),
    "Must be a relative path (/...) or absolute URL"
  );

// v3.37.8 — accept BOTH the pre-May-15 working models and the post-May-15
// replacements. Admins can opt into the new strings early. On May 14 we'll
// drop the deprecated ones in a follow-up release.
// See: https://docs.x.ai/developers/migration/may-15-deprecation
const ALLOWED_AI_MODELS = [
  // Currently working (will be removed May 15, 2026)
  "grok-4-fast-reasoning",
  "grok-4-fast-non-reasoning",
  "grok-3-mini",
  // Replacements (per the deprecation doc — may not be routable until cutover)
  "grok-4.3",
  "grok-4.20-non-reasoning",
] as const;

const PatchOrg = z.object({
  name: z.string().min(2).max(120).optional(),
  brandColor: z.string().nullable().optional(),
  brandLogoUrl: logoUrlSchema.nullable().optional(),
  brandPalette: z
    .object({
      primary: z.string().optional(),
      secondary: z.string().optional(),
      accent: z.string().optional(),
      neutral: z.string().optional(),
      success: z.string().optional(),
      warning: z.string().optional(),
      danger: z.string().optional(),
    })
    .nullable()
    .optional(),
  // Per-org AI model — only ORG_ADMIN can set/change this; enforced below.
  aiModel: z.enum(ALLOWED_AI_MODELS).nullable().optional(),
  websiteUrl: logoUrlSchema.nullable().optional(),
  // Company profile updates rolled into the same call
  companyProfile: z.object({
    salesMethodology: z.string().nullable().optional(),
    values: z.array(z.string()).optional(),
    requiredSkills: z.array(z.object({ category: z.string(), weight: z.number() })).optional(),
    intakeConfig: z.record(z.any()).optional(),
    // SMTP — leave smtpPass undefined to keep existing; pass empty string to clear
    smtpHost: z.string().nullable().optional(),
    smtpPort: z.number().int().min(1).max(65535).nullable().optional(),
    smtpSecure: z.boolean().optional(),
    smtpUser: z.string().nullable().optional(),
    smtpPass: z.string().optional(),
    smtpFrom: z.string().nullable().optional(),
    // v3.37 — per-org gamified self-coach button label.
    improveButtonLabel: z.string().max(40).nullable().optional(),
  }).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN");
  // Company admin can only edit their own org
  if (ctx.role === "COMPANY_ADMIN" && ctx.effectiveOrgId !== params.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = PatchOrg.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });

  const { companyProfile, aiModel, ...orgPatch } = parsed.data;

  // Only ORG_ADMIN can change the model selection. Silently strip it for COMPANY_ADMIN.
  const orgData: any = { ...orgPatch };
  if (ctx.role === "ORG_ADMIN" && aiModel !== undefined) {
    orgData.aiModel = aiModel;
  }

  await prisma.org.update({
    where: { id: params.id },
    data: orgData,
  });

  if (companyProfile) {
    // Special handling: if smtpPass is undefined, don't touch it.
    const cp: any = { ...companyProfile };
    if (cp.smtpPass === undefined) delete cp.smtpPass;
    if (cp.smtpPass === "") cp.smtpPass = null;
    await prisma.companyProfile.upsert({
      where: { orgId: params.id },
      create: { orgId: params.id, ...cp },
      update: cp,
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  await requireRole("ORG_ADMIN");
  await prisma.org.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
