/**
 * GET /api/synthesis-status
 *
 * v3.37.5 — current user's profile synthesis status. Used by the dashboard
 * banner to poll while a background AE/Director synthesis runs.
 *
 * v3.37.6 — also detects ORPHANED state: a COMPLETED answerSet exists but
 * the profile was never synthesized (synthesisStatus null AND
 * lastSynthesizedAt null). This catches anyone whose intake submitted before
 * the async pattern shipped — their old synchronous run errored, returned
 * 500 to the client, and left them stranded with no obvious retry path.
 *
 * Response: { status, error, startedAt, ageSeconds, isReady, isGenerating, isFailed, isOrphaned }
 *   - status:        AiJobStatus | null  (null on orphaned-but-recoverable)
 *   - isFailed:      true for explicit FAILED **or** orphaned (banner already
 *                    handles isFailed by surfacing the retry button)
 *   - isOrphaned:    true only for the recoverable null+COMPLETED case so
 *                    the banner can show different copy if it wants
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenancy";

export const runtime = "nodejs";

export async function GET() {
  const ctx = await requireSession();

  const ae = await prisma.aeProfile.findUnique({
    where: { userId: ctx.userId },
    select: {
      id: true, synthesisStatus: true, synthesisError: true,
      synthesisStartedAt: true, lastSynthesizedAt: true,
    },
  }) as any;
  const dp = !ae ? await prisma.directorProfile.findUnique({
    where: { userId: ctx.userId },
    select: {
      id: true, synthesisStatus: true, synthesisError: true,
      synthesisStartedAt: true, lastSynthesizedAt: true,
    },
  }) as any : null;

  const profile = ae ?? dp;
  if (!profile) {
    return NextResponse.json({
      status: null, error: null, startedAt: null, ageSeconds: 0,
      isReady: false, isGenerating: false, isFailed: false, isOrphaned: false,
    });
  }

  const status: string | null = profile.synthesisStatus ?? null;
  const startedAt: Date | null = profile.synthesisStartedAt ?? null;
  const ageSeconds = startedAt ? Math.floor((Date.now() - startedAt.getTime()) / 1000) : 0;

  // Orphaned check — only relevant when no explicit status is set and the
  // profile hasn't synthesized. Look for a COMPLETED answerSet to confirm
  // the user actually finished intake.
  let isOrphaned = false;
  if (!status && !profile.lastSynthesizedAt) {
    const completedAnswerSet = await prisma.answerSet.findFirst({
      where: ae
        ? { aeProfileId: ae.id, status: "COMPLETED" }
        : { directorProfileId: dp.id, status: "COMPLETED" },
      select: { id: true },
    });
    if (completedAnswerSet) isOrphaned = true;
  }

  const isFailed = status === "FAILED" || isOrphaned;

  return NextResponse.json({
    status,
    error: profile.synthesisError ?? (isOrphaned
      ? "Your intake was submitted before our async upgrade. Click retry to finish synthesizing."
      : null),
    startedAt: startedAt?.toISOString() ?? null,
    ageSeconds,
    isReady: status === "READY" || (!status && !!profile.lastSynthesizedAt),
    isGenerating: status === "GENERATING",
    isFailed,
    isOrphaned,
  });
}
