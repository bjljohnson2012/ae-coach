/**
 * GET /api/admin/orgs/[id]/export
 *
 * Returns a single JSON file with the full export of the org's data so the
 * customer can keep everything on offboarding (or back up at any time).
 *
 * Includes: org, companyProfile, users (passwords stripped), products,
 * knowledge articles, AE profiles + skill scores + answer sets + answers,
 * director profiles + skill scores + answer sets + answers, director reviews,
 * tasks, files (metadata only — no binary), audit log.
 *
 * SMTP credentials are scrubbed from the export for security.
 *
 * Authorization:
 *   - ORG_ADMIN: any org
 *   - COMPANY_ADMIN: their own org only
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN");
  if (ctx.role === "COMPANY_ADMIN" && ctx.effectiveOrgId !== params.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const org = await prisma.org.findUnique({
    where: { id: params.id },
    include: { companyProfile: true },
  });
  if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });

  // Scrub secrets from companyProfile before exporting.
  const safeCompanyProfile = org.companyProfile
    ? {
        ...org.companyProfile,
        smtpPass: org.companyProfile.smtpPass ? "[REDACTED]" : null,
      }
    : null;

  const [users, products, knowledgeArticles, aeProfiles, directorProfiles, directorReviews, tasks, files, auditLog] = await Promise.all([
    prisma.user.findMany({
      where: { orgId: params.id },
      // Strip password hash and reset tokens.
      select: {
        id: true, email: true, name: true, role: true, status: true, imageUrl: true,
        vpId: true, invitedById: true, invitedAt: true, passwordSetAt: true,
        lastLoginAt: true, createdAt: true, updatedAt: true,
      },
    }),
    prisma.product.findMany({ where: { orgId: params.id } }),
    prisma.knowledgeArticle.findMany({ where: { orgId: params.id } }),
    prisma.aeProfile.findMany({
      where: { orgId: params.id },
      include: {
        skillScores: true,
        answerSets: { include: { answers: true } },
      },
    }),
    prisma.directorProfile.findMany({
      where: { orgId: params.id },
      include: {
        skillScores: true,
        answerSets: { include: { answers: true } },
      },
    }),
    prisma.directorReview.findMany({
      where: { aeProfile: { orgId: params.id } },
      include: { answers: true },
    }),
    prisma.task.findMany({
      where: {
        OR: [
          { aeProfile: { orgId: params.id } },
          { assignee: { orgId: params.id } },
        ],
      },
    }),
    prisma.fileAsset.findMany({
      where: { orgId: params.id },
      // Drop the binary blob — too big and not portable. Path + metadata only.
      select: {
        id: true, filename: true, mimeType: true, sizeBytes: true,
        storagePath: true, createdAt: true, ownerUserId: true,
      },
    }),
    prisma.auditLog.findMany({
      where: { orgId: params.id },
      orderBy: { createdAt: "desc" },
      take: 5000, // safety cap
    }),
  ]);

  const exportPayload = {
    schemaVersion: "1.0",
    exportedAt: new Date().toISOString(),
    exportedBy: { id: ctx.userId, email: ctx.email, name: ctx.name, role: ctx.role },
    org: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      brandColor: org.brandColor,
      brandLogoUrl: org.brandLogoUrl,
      websiteUrl: org.websiteUrl,
      status: org.status,
      offboardedAt: org.offboardedAt,
      offboardReason: org.offboardReason,
      createdAt: org.createdAt,
    },
    companyProfile: safeCompanyProfile,
    counts: {
      users: users.length,
      products: products.length,
      knowledgeArticles: knowledgeArticles.length,
      aeProfiles: aeProfiles.length,
      directorProfiles: directorProfiles.length,
      directorReviews: directorReviews.length,
      tasks: tasks.length,
      files: files.length,
      auditLogEntries: auditLog.length,
    },
    users,
    products,
    knowledgeArticles,
    aeProfiles,
    directorProfiles,
    directorReviews,
    tasks,
    files,
    auditLog,
  };

  // Audit the export itself
  await prisma.auditLog.create({
    data: {
      orgId: org.id,
      actorUserId: ctx.userId,
      action: "ORG_DATA_EXPORTED",
      targetType: "Org",
      targetId: org.id,
      metadata: { counts: exportPayload.counts },
    },
  });

  const safeSlug = (org.slug || "org").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const filename = `${safeSlug}-export-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
