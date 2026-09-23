/**
 * Duplicate detection for question authoring.
 *
 * The user can have a "duplicate" question that's worded slightly differently
 * (extra punctuation, different casing, leading/trailing whitespace). We
 * normalize aggressively before comparison so trivial cosmetic differences
 * don't slip through.
 *
 * Scope of the search:
 *   - global bank (orgId: null)
 *   - the requesting user's own org's bank
 * If the user is ORG_ADMIN authoring on behalf of a specific customer org,
 * pass that org's ID in `targetOrgId` so the search includes it (instead of
 * the admin's own home org).
 */
import { prisma } from "@/lib/prisma";

export function normalizeQuestionText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")  // smart single quotes
    .replace(/[“”„‟]/g, '"')   // smart double quotes
    .replace(/[–—]/g, "-")               // en/em dashes
    .replace(/[^\w\s'?.-]/g, " ")                  // strip everything but letters/digits/space/'-?.
    .replace(/\s+/g, " ")                          // collapse whitespace
    .trim()
    .replace(/[?.]+$/, "");                        // drop trailing punctuation
}

export interface DuplicateMatch {
  questionId: string;
  text: string;
  scope: "global" | "this-org" | "other-org";
  orgName: string | null;
  category: string;
  productName: string | null;
  exactMatch: boolean;
}

/**
 * Returns the closest match if there's a duplicate, otherwise null.
 * Currently exact-match only (after normalization). Fuzzy/semantic match is
 * a future v3.32 enhancement using Grok embeddings.
 */
export async function findDuplicateQuestion(opts: {
  text: string;
  category: string;
  targetOrgId: string;
  scope?: "default" | "all-orgs"; // ORG_ADMIN authoring across orgs uses "all-orgs"
}): Promise<DuplicateMatch | null> {
  const normalized = normalizeQuestionText(opts.text);
  if (normalized.length < 5) return null;

  // Pull the candidate set: global + target org (and optionally every org for super admin)
  const candidates = await prisma.question.findMany({
    where: {
      category: opts.category as any,
      active: true,
      ...(opts.scope === "all-orgs"
        ? {}
        : { OR: [{ orgId: null }, { orgId: opts.targetOrgId }] }),
    },
    select: {
      id: true,
      text: true,
      orgId: true,
      org: { select: { name: true } },
      product: { select: { name: true } },
    },
    take: 2000, // safety cap
  });

  for (const c of candidates) {
    if (normalizeQuestionText(c.text) === normalized) {
      const scope: "global" | "this-org" | "other-org" =
        c.orgId === null ? "global" : c.orgId === opts.targetOrgId ? "this-org" : "other-org";
      return {
        questionId: c.id,
        text: c.text,
        scope,
        orgName: c.org?.name ?? null,
        category: opts.category,
        productName: c.product?.name ?? null,
        exactMatch: true,
      };
    }
  }
  return null;
}
