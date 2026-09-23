/**
 * POST /api/files — accept file metadata + mapping decision (after AI classify + confirm).
 * v0 stores metadata only; actual binary storage is wired in v3 (S3 or local disk).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, assertCanAccessAe } from "@/lib/tenancy";
import { crossReferencePrepDoc } from "@/lib/ai";

const Body = z.object({
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  storagePath: z.string(), // path or s3 key (v0: just a placeholder)
  kind: z.enum(["PHOTO", "AE_PREP_DOC", "COACHING_DOC", "PROFILE_ASSET", "PRODUCT_REFERENCE", "PERSONALITY_NOTE", "GENERAL", "OTHER"]),
  aeProfileId: z.string().optional(),
  updateIntent: z.enum(["ADD_TO_COACHING_LOG", "UPDATE_PROFILE", "REFERENCE_ONLY"]),
  visibility: z.enum(["AE_ONLY", "DIRECTOR_ONLY", "BOTH"]).default("DIRECTOR_ONLY"),
  // AI suggestion fields (for audit) — optional
  aiSuggestedKind: z.string().optional(),
  aiSuggestedAeProfileId: z.string().optional(),
  aiSuggestedIntent: z.string().optional(),
  aiConfidence: z.number().optional(),
  aiRationale: z.string().optional(),
  // If kind is COACHING_DOC and intent is UPDATE_PROFILE, content used for cross-ref
  textContent: z.string().optional(),
});

export async function POST(req: Request) {
  const ctx = await requireRole("DIRECTOR", "ORG_ADMIN");
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  const b = parsed.data;

  if (b.aeProfileId) {
    const access = await assertCanAccessAe(ctx, b.aeProfileId);
    if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const mapping = await prisma.fileMapping.create({
    data: {
      orgId: ctx.effectiveOrgId,
      mappedByUserId: ctx.userId,
      aeProfileId: b.aeProfileId,
      kind: b.kind as any,
      updateIntent: b.updateIntent as any,
      visibility: b.visibility as any,
      aiSuggestedKind: (b.aiSuggestedKind as any) ?? null,
      aiSuggestedAeProfileId: b.aiSuggestedAeProfileId ?? null,
      aiSuggestedIntent: (b.aiSuggestedIntent as any) ?? null,
      aiConfidence: b.aiConfidence ?? null,
      aiRationale: b.aiRationale ?? null,
      confirmedAt: new Date(),
    },
  });

  const file = await prisma.fileAsset.create({
    data: {
      orgId: ctx.effectiveOrgId,
      ownerUserId: ctx.userId,
      aeProfileId: b.aeProfileId,
      kind: b.kind as any,
      filename: b.filename,
      storagePath: b.storagePath,
      mimeType: b.mimeType,
      sizeBytes: b.sizeBytes,
      visibility: b.visibility as any,
      mappingId: mapping.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      orgId: ctx.effectiveOrgId,
      actorUserId: ctx.userId,
      action: "FILE_UPLOADED",
      targetType: "FileAsset",
      targetId: file.id,
      metadata: { kind: b.kind, aeProfileId: b.aeProfileId ?? null },
    },
  });

  // Coaching doc → cross-reference + persist talking points
  if (b.kind === "COACHING_DOC" && b.updateIntent === "UPDATE_PROFILE" && b.aeProfileId && b.textContent) {
    const ae = await prisma.aeProfile.findUnique({
      where: { id: b.aeProfileId },
      include: { user: true, org: { include: { companyProfile: true } }, skillScores: true },
    });
    if (ae) {
      try {
        const xref = await crossReferencePrepDoc({
          aeProfile: {
            name: ae.user.name,
            personalitySummary: ae.personalitySummary,
            salesStyleSummary: ae.salesStyleSummary,
            communicationSummary: ae.communicationSummary,
            strengths: (ae.strengthsJson as string[]) ?? [],
            weaknesses: (ae.weaknessesJson as string[]) ?? [],
            skillScores: ae.skillScores.map((s) => ({ category: s.category, score: s.score })),
          },
          prepDoc: { weekOf: new Date().toISOString(), title: b.filename, content: b.textContent },
          companyContext: {
            name: ae.org.name,
            salesMethodology: ae.org.companyProfile?.salesMethodology ?? null,
          },
        });

        // Persist as PrepDoc + CrossRefAnalysis
        const prep = await prisma.prepDoc.create({
          data: {
            aeProfileId: ae.id,
            directorId: ctx.userId,
            weekOf: new Date(new Date().setHours(0, 0, 0, 0)),
            title: b.filename,
            content: b.textContent,
            fileId: file.id,
          },
        });
        await prisma.crossRefAnalysis.create({
          data: {
            prepDocId: prep.id,
            aeProfileId: ae.id,
            recommendationsJson: xref.recommendations as any,
            talkingPointsJson: xref.talkingPoints as any,
          },
        });

        // Auto-create Recommendations with routing rules
        for (const rec of xref.recommendations ?? []) {
          const cat = (rec.category as any) ?? "GENERAL";
          const isPersonality = cat === "PERSONALITY";
          await prisma.recommendation.create({
            data: {
              aeProfileId: ae.id,
              source: "AI",
              category: cat,
              routeTo: isPersonality ? "DIRECTOR_ONLY" : (rec.routeTo as any) ?? "AE",
              channel: isPersonality ? "NOTE" : "TASK",
              title: rec.title,
              description: rec.description,
              status: "OPEN",
            },
          });
        }
      } catch (err) {
        console.error("Cross-ref failed:", err);
        // Non-fatal — file still uploaded
      }
    }
  }

  return NextResponse.json({ file, mapping });
}
