/**
 * GET /api/cron/run-weekly-briefs
 *
 * Auth: bearer token matching CRON_SECRET. Designed to be called once a week
 * (Monday morning ~7am local) by the docker-compose cron sidecar.
 *
 * For every user with weeklyBriefSubscribed=true who hasn't received a brief
 * in the last 6 days:
 *   1. Pull their profile (AE or Director) to get personality + skill scores
 *   2. Find their 2-3 weakest skills
 *   3. Generate a personalized brief via Grok (FAST tier)
 *   4. Send via the recipient org's SMTP, branded with org colors/logo
 *   5. Update User.weeklyBriefLastSentAt
 *
 * Errors on a single user don't fail the batch — collected and returned.
 *
 * Idempotency: the 6-day gate prevents double-sends if the cron fires twice.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateWeeklyBrief } from "@/lib/ai";
import { sendEmail, weeklyBriefEmail } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 600;

const SIX_DAYS_MS = 6 * 24 * 3600 * 1000;

function frozenWritesResponse() {
  return NextResponse.json(
    { error: "AE writes are frozen" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(req: Request) {
  // This GET updates weeklyBriefLastSentAt and sends mail. Refuse before any read or write.
  // Bracket access so the runtime flag is not inlined at image build.
  if (process.env["AE_WRITES_FROZEN"] === "1") return frozenWritesResponse();

  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get("authorization") ?? "";
    const provided = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (provided !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const cutoff = new Date(Date.now() - SIX_DAYS_MS);
  const subscribers = await prisma.user.findMany({
    where: {
      weeklyBriefSubscribed: true,
      status: "ACTIVE" as any,
      OR: [
        { weeklyBriefLastSentAt: null },
        { weeklyBriefLastSentAt: { lt: cutoff } },
      ],
    } as any,
    include: {
      org: { select: { name: true, brandColor: true, brandLogoUrl: true, status: true, aiModel: true } },
      aeProfile: {
        include: { skillScores: true },
      },
      directorProfile: {
        include: { skillScores: true },
      },
    },
  });

  const results: Array<{ userId: string; ok: boolean; error?: string }> = [];
  let sent = 0;
  let skipped = 0;

  for (const user of subscribers) {
    try {
      // Skip OFFBOARDED orgs
      if ((user.org as any)?.status === "OFFBOARDED") {
        skipped++;
        results.push({ userId: user.id, ok: true, error: "org offboarded" });
        continue;
      }

      const profile: any = user.aeProfile ?? user.directorProfile;
      if (!profile) {
        skipped++;
        results.push({ userId: user.id, ok: true, error: "no profile yet" });
        continue;
      }

      // Bottom 2-3 skills (their growth zone)
      const sorted = [...(profile.skillScores ?? [])].sort((a: any, b: any) => a.score - b.score);
      const weakest = sorted.slice(0, 3).map((s: any) => ({ category: s.category, score: s.score }));
      const top = sorted[sorted.length - 1];

      const brief = await generateWeeklyBrief(
        {
          name: user.name,
          role: user.role as any,
          enneagramType: profile.enneagramType,
          discProfile: profile.discProfile,
          mbtiType: profile.mbtiType,
          weakestSkills: weakest,
          topStrength: top?.category,
          motivations: (profile.motivations as string[]) ?? [],
        },
        user.org?.aiModel,
      );

      const tmpl = weeklyBriefEmail(user.name, brief, {
        orgName: user.org?.name,
        brandColor: user.org?.brandColor,
        brandLogoUrl: user.org?.brandLogoUrl,
      });

      const sendRes = await sendEmail(
        { to: user.email, subject: tmpl.subject, text: tmpl.text, html: tmpl.html },
        { orgId: user.orgId },
      );

      await prisma.user.update({
        where: { id: user.id },
        data: { weeklyBriefLastSentAt: new Date() } as any,
      });

      results.push({ userId: user.id, ok: sendRes.ok, error: sendRes.error });
      if (sendRes.ok) sent++;
    } catch (err: any) {
      results.push({ userId: user.id, ok: false, error: err?.message ?? "unknown" });
      console.error("[weekly-brief] failed for user", user.id, err);
    }
  }

  return NextResponse.json({
    ok: true,
    candidates: subscribers.length,
    sent,
    skipped,
    failures: results.filter((r) => !r.ok).length,
    results,
  });
}
