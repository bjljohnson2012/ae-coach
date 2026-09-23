/**
 * Event-driven regeneration helper.
 *
 * Returns the most recent timestamp across every input that should trigger a
 * fresh AI synthesis (intake/quiz answers, coaching notes, monthly reviews,
 * 1:1 prep sessions). Compare a cached `coachingHintsAt` or `reasoningSummaryAt`
 * against this — if cache is older, regenerate; if newer or equal, serve cached.
 *
 * Saves tokens — a Grok call only fires when something has actually changed.
 */
import { prisma } from "@/lib/prisma";

export async function getLatestInputSignalAt(target: { aeProfileId?: string; directorProfileId?: string }): Promise<Date | null> {
  const aeId = target.aeProfileId;
  const dpId = target.directorProfileId;

  const queries: Promise<Date | null>[] = [];

  if (aeId) {
    queries.push(
      prisma.answerSet.findFirst({
        where: { aeProfileId: aeId, status: "COMPLETED" },
        orderBy: { completedAt: "desc" },
        select: { completedAt: true },
      }).then((r) => r?.completedAt ?? null),
      prisma.coachingNote.findFirst({
        where: { aeProfileId: aeId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }).then((r) => r?.createdAt ?? null),
      prisma.directorReview.findFirst({
        where: { aeProfileId: aeId, status: "COMPLETED" },
        orderBy: { completedAt: "desc" },
        select: { completedAt: true },
      }).then((r) => r?.completedAt ?? null),
      prisma.oneOnOnePrep.findFirst({
        where: { aeProfileId: aeId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }).then((r) => r?.createdAt ?? null),
    );
  }
  if (dpId) {
    queries.push(
      prisma.answerSet.findFirst({
        where: { directorProfileId: dpId, status: "COMPLETED" },
        orderBy: { completedAt: "desc" },
        select: { completedAt: true },
      }).then((r) => r?.completedAt ?? null),
      prisma.oneOnOnePrep.findFirst({
        where: { directorProfileId: dpId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }).then((r) => r?.createdAt ?? null),
    );
  }

  const results = await Promise.all(queries);
  const dates = results.filter((d): d is Date => !!d);
  if (dates.length === 0) return null;
  return new Date(Math.max(...dates.map((d) => d.getTime())));
}

/** Should we regenerate? True if cache is missing, older than latest signal, or invalid. */
export function isStale(cachedAt: Date | null | undefined, signalAt: Date | null): boolean {
  if (!cachedAt) return true;
  if (!signalAt) return false; // no signals at all — keep cache
  return cachedAt.getTime() < signalAt.getTime();
}
