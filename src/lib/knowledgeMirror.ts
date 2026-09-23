/**
 * Knowledge mirror — v3.37.
 *
 * Bridges OrgSkillBenchmarkFile (admin-uploaded reference docs) into the
 * org's KnowledgeRepository so AEs and directors browsing the knowledge
 * library see the reference material alongside everything else.
 *
 * Behavior:
 *   - One auto-managed repository per org named "Skill Benchmarks"
 *     (kind = SALES, visibility = BOTH so AEs can see it).
 *   - One KnowledgeArticle per benchmark file. Title format:
 *     "[CATEGORY] filename" so a search for the category surfaces all refs.
 *   - Status = APPROVED (admin-uploaded, no review needed).
 *   - Tags include "benchmark", "reference", and the category name.
 *
 * The mirror is one-way and idempotent — if an article already exists for
 * the same benchmarkFileId tag, we update its body; otherwise we create.
 */
import { prisma } from "@/lib/prisma";
import { getSkillBenchmark } from "@/lib/skillBenchmarks";

const MIRROR_REPO_NAME = "Skill Benchmarks";

export async function mirrorBenchmarkFileToKnowledge(input: {
  orgId: string;
  category: string;
  benchmarkFileId: string;
  filename: string;
  text: string;
  uploadedByUserId: string;
}): Promise<void> {
  const benchmark = getSkillBenchmark(input.category);
  const skillLabel = benchmark?.label ?? input.category.replace(/_/g, " ");

  // Find-or-create the org's mirror repo. SALES_SKILL is the closest existing
  // bucket — these uploads are skill-rubric reference material.
  const repo = await prisma.knowledgeRepository.upsert({
    where: { orgId_name: { orgId: input.orgId, name: MIRROR_REPO_NAME } },
    update: {},
    create: {
      orgId: input.orgId,
      kind: "SALES_SKILL",
      name: MIRROR_REPO_NAME,
      description: "Auto-mirrored reference material from your skill benchmark uploads. Used by the AI to anchor scoring + drills to your org's bar.",
      visibility: "BOTH",
    },
  });

  // Idempotent: if an article already exists with this benchmarkFileId tag,
  // update it; otherwise create. We tag with `bf:<id>` so dedupe is exact.
  const tagMarker = `bf:${input.benchmarkFileId}`;
  const existing = await prisma.knowledgeArticle.findFirst({
    where: {
      orgId: input.orgId,
      repositoryId: repo.id,
      tagsJson: { array_contains: tagMarker } as any,
    },
    select: { id: true },
  });

  // Body — keep extraction terse but searchable. Header context helps the AI
  // route discovery toward the right reference when answering rep questions.
  const body = [
    `## ${skillLabel} — Reference: ${input.filename}`,
    "",
    `_Mirrored from your skill benchmark library. Uploaded as a reference for what good looks like at your org._`,
    "",
    input.text.slice(0, 50000),
  ].join("\n");

  const tags = ["benchmark", "reference", input.category, skillLabel, tagMarker];

  if (existing) {
    await prisma.knowledgeArticle.update({
      where: { id: existing.id },
      data: {
        title: `${skillLabel} — ${input.filename}`,
        body,
        tagsJson: tags as any,
        updatedAt: new Date(),
      },
    });
  } else {
    await prisma.knowledgeArticle.create({
      data: {
        orgId: input.orgId,
        repositoryId: repo.id,
        skillCategory: isValidSkillCategory(input.category) ? (input.category as any) : null,
        title: `${skillLabel} — ${input.filename}`,
        body,
        tagsJson: tags as any,
        authorUserId: input.uploadedByUserId,
        status: "APPROVED",
        approvedByUserId: input.uploadedByUserId,
        approvedAt: new Date(),
      },
    });
  }
}

// SkillCategory in the Prisma schema is a fixed enum. Custom categories
// (org-added) shouldn't write into the FK column — leave it null and let
// the title + tags handle search.
const VALID_CATEGORIES = new Set([
  "DISCOVERY",
  "OBJECTION_HANDLING",
  "CLOSING",
  "COMMUNICATION",
  "RESILIENCE",
  "PRODUCT_MASTERY",
  "LEADERSHIP",
  "FORECASTING",
]);

function isValidSkillCategory(cat: string): boolean {
  return VALID_CATEGORIES.has(cat);
}

/**
 * Called when a benchmark file is deleted. Clears the mirror article so the
 * KnowledgeRepository view stays in sync.
 */
export async function unmirrorBenchmarkFile(orgId: string, benchmarkFileId: string): Promise<void> {
  const tagMarker = `bf:${benchmarkFileId}`;
  const article = await prisma.knowledgeArticle.findFirst({
    where: {
      orgId,
      tagsJson: { array_contains: tagMarker } as any,
    },
    select: { id: true },
  });
  if (!article) return;
  await prisma.knowledgeArticle.delete({ where: { id: article.id } });
}
