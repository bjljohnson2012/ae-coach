/**
 * Two-tier "What Good Looks Like" lookup — v3.37.
 *
 * Resolution order for any (orgId, skillCategory) pair:
 *
 *   1. The org's own override   — orgs/<orgId> wrote it themselves
 *   2. The PLATFORM org override — Ben's home org sets the smart default
 *   3. The hardcoded platform default in skillBenchmarks.ts
 *
 * The platform org is identified by having at least one ORG_ADMIN. If multiple
 * platform orgs exist (shouldn't, but defensively), the oldest one wins so the
 * cascade is deterministic.
 *
 * Used everywhere a rubric needs to be applied:
 *   - SkillScoreChip popover (display)
 *   - Score recalibration prompts (judging)
 *   - Gamification drill prompts (target behavior)
 */
import { prisma } from "@/lib/prisma";
import { getSkillBenchmark } from "@/lib/skillBenchmarks";

// In-memory cache for the platform org id. The platform org is created at
// seed and doesn't change at runtime; cache for 5 minutes. Wiping the cache
// requires a process restart, which is acceptable since this is config.
let platformOrgIdCache: { id: string | null; expires: number } | null = null;

async function resolvePlatformOrgId(): Promise<string | null> {
  const now = Date.now();
  if (platformOrgIdCache && platformOrgIdCache.expires > now) {
    return platformOrgIdCache.id;
  }
  const platformOrg = await prisma.org.findFirst({
    where: { users: { some: { role: "ORG_ADMIN" } } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  platformOrgIdCache = {
    id: platformOrg?.id ?? null,
    expires: now + 5 * 60 * 1000,
  };
  return platformOrgIdCache.id;
}

/**
 * Manually invalidate the platform-org cache. Call this from any code path
 * that creates/deletes the platform org (very rare — basically only the seed).
 */
export function invalidatePlatformOrgCache() {
  platformOrgIdCache = null;
}

export interface EffectiveBenchmark {
  /** Final string the UI / scorer should use. Always non-null. */
  whatGoodLooksLike: string;
  /** Where the value came from — useful for debug + admin "why" tooltips. */
  source: "ORG_OVERRIDE" | "PLATFORM_OVERRIDE" | "PLATFORM_DEFAULT";
  /** True when this org has its own override. */
  isOrgOverride: boolean;
  /** True when the platform org has overridden the hardcoded default. */
  isPlatformOverride: boolean;
}

/**
 * Resolve the effective rubric for a single (orgId, category) pair.
 * Returns null only if the category itself isn't a known SkillBenchmark
 * (e.g. a custom category an org added without seeding a benchmark).
 */
export async function getEffectiveBenchmark(
  orgId: string,
  category: string,
): Promise<EffectiveBenchmark | null> {
  const platformDefault = getSkillBenchmark(category);
  if (!platformDefault) return null;

  const platformOrgId = await resolvePlatformOrgId();

  // Pull both rows in one query when the org isn't itself the platform org.
  // If it IS the platform org, only its own row matters.
  const orgIdsToCheck = platformOrgId && platformOrgId !== orgId
    ? [orgId, platformOrgId]
    : [orgId];

  const overrides = await prisma.orgSkillBenchmark.findMany({
    where: { orgId: { in: orgIdsToCheck }, category },
    select: { orgId: true, whatGoodLooksLike: true },
  });

  const ownOverride = overrides.find((o) => o.orgId === orgId)?.whatGoodLooksLike;
  const platformOverride = platformOrgId && platformOrgId !== orgId
    ? overrides.find((o) => o.orgId === platformOrgId)?.whatGoodLooksLike
    : null;

  if (ownOverride && ownOverride.trim()) {
    return {
      whatGoodLooksLike: ownOverride,
      source: "ORG_OVERRIDE",
      isOrgOverride: true,
      isPlatformOverride: !!(platformOverride && platformOverride.trim()),
    };
  }
  if (platformOverride && platformOverride.trim()) {
    return {
      whatGoodLooksLike: platformOverride,
      source: "PLATFORM_OVERRIDE",
      isOrgOverride: false,
      isPlatformOverride: true,
    };
  }
  return {
    whatGoodLooksLike: platformDefault.whatGoodLooksLike,
    source: "PLATFORM_DEFAULT",
    isOrgOverride: false,
    isPlatformOverride: false,
  };
}

/**
 * Bulk version — resolves every category for an org in one pass. Used by the
 * synthesizer (which scores all skills at once) and the org-skills API.
 */
export async function getEffectiveBenchmarksForOrg(
  orgId: string,
  categories: string[],
): Promise<Map<string, EffectiveBenchmark>> {
  const platformOrgId = await resolvePlatformOrgId();
  const orgIdsToCheck = platformOrgId && platformOrgId !== orgId
    ? [orgId, platformOrgId]
    : [orgId];

  const rows = await prisma.orgSkillBenchmark.findMany({
    where: { orgId: { in: orgIdsToCheck }, category: { in: categories } },
    select: { orgId: true, category: true, whatGoodLooksLike: true },
  });

  const out = new Map<string, EffectiveBenchmark>();
  for (const cat of categories) {
    const platformDefault = getSkillBenchmark(cat);
    if (!platformDefault) continue;

    const own = rows.find((r) => r.orgId === orgId && r.category === cat)?.whatGoodLooksLike;
    const platform = platformOrgId && platformOrgId !== orgId
      ? rows.find((r) => r.orgId === platformOrgId && r.category === cat)?.whatGoodLooksLike
      : null;

    if (own && own.trim()) {
      out.set(cat, {
        whatGoodLooksLike: own,
        source: "ORG_OVERRIDE",
        isOrgOverride: true,
        isPlatformOverride: !!(platform && platform.trim()),
      });
    } else if (platform && platform.trim()) {
      out.set(cat, {
        whatGoodLooksLike: platform,
        source: "PLATFORM_OVERRIDE",
        isOrgOverride: false,
        isPlatformOverride: true,
      });
    } else {
      out.set(cat, {
        whatGoodLooksLike: platformDefault.whatGoodLooksLike,
        source: "PLATFORM_DEFAULT",
        isOrgOverride: false,
        isPlatformOverride: false,
      });
    }
  }
  return out;
}
