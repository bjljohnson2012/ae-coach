/**
 * 1:1 prep upload for a director (VP coaching their director).
 * Mirrors /api/ae/[id]/prep but for DirectorProfile.
 *
 * Background-job pattern — see /api/ae/[id]/prep for the full design rationale.
 * The row is created immediately with status=GENERATING, the response returns
 * the row ID, and the AI work runs as a fire-and-forget promise.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, assertCanAccessDirector } from "@/lib/tenancy";
import { extractText } from "@/lib/files";
import { generateOneOnOnePrep } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN", "VP_SALES");
  const access = await assertCanAccessDirector(ctx, params.id);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Multipart or JSON body
  let prepDocText = "";
  let prepDocFilename: string | null = null;
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "File exceeds 10 MB" }, { status: 413 });
    const buffer = Buffer.from(await file.arrayBuffer());
    prepDocFilename = file.name;
    try {
      prepDocText = await extractText(file.name, file.type || "application/octet-stream", buffer);
    } catch (e: any) {
      return NextResponse.json({ error: `Could not extract text: ${e?.message ?? "unknown"}` }, { status: 422 });
    }
    if (!prepDocText || prepDocText.length < 30) {
      return NextResponse.json({ error: "Extracted text was empty." }, { status: 422 });
    }
  } else {
    const body = await req.json().catch(() => ({}));
    prepDocText = (body.prepDocText ?? "").toString().trim();
    if (!prepDocText || prepDocText.length < 30) {
      return NextResponse.json({ error: "prepDocText is too short" }, { status: 400 });
    }
  }

  // Create the prep row immediately so the client gets an ID to track.
  const prep = await prisma.oneOnOnePrep.create({
    data: {
      directorProfileId: params.id,
      preparedByUserId: ctx.userId,
      prepDocFilename,
      prepDocText: prepDocText.slice(0, 50000),
      generatedJson: {},
      status: "GENERATING" as any,
      modelUsed: "pending",
    },
    select: { id: true, status: true, startedAt: true },
  });

  void runDirectorPrepInBackground(prep.id, params.id, prepDocText);

  return NextResponse.json({
    prep: { id: prep.id, status: prep.status, startedAt: prep.startedAt },
    message: "Prep is generating — safe to navigate away.",
  });
}

async function runDirectorPrepInBackground(prepId: string, directorProfileId: string, prepDocText: string) {
  try {
    const dp = await prisma.directorProfile.findUnique({
      where: { id: directorProfileId },
      include: {
        user: { select: { id: true, name: true } },
        skillScores: true,
        org: { select: { aiModel: true } },
      },
    });
    if (!dp) throw new Error("Director not found");

    // Pull director's team roster for richer coaching context
    const teamAes = await prisma.aeProfile.findMany({
      where: { directorId: dp.user.id },
      include: {
        user: { select: { name: true } },
        skillScores: { select: { category: true, score: true } },
        quarterlyPerformance: {
          orderBy: [{ year: "desc" }, { quarter: "desc" }],
          take: 1,
          select: { quotaCents: true, attainedCents: true },
        },
      },
    });

    const teamRoster = teamAes.map((ae) => {
      const sorted = [...ae.skillScores].sort((a, b) => b.score - a.score);
      const top = sorted[0];
      const bottom = sorted[sorted.length - 1];
      const lastQ = ae.quarterlyPerformance[0];
      const pct = lastQ?.quotaCents && lastQ.attainedCents !== null
        ? Math.round(((lastQ.attainedCents ?? 0) / lastQ.quotaCents) * 100)
        : null;
      return {
        name: ae.user.name,
        topStrength: top?.category,
        topGap: bottom?.category,
        lastQuotaPct: pct,
      };
    });

    const result = await generateOneOnOnePrep(
      {
        aeProfile: {
          name: dp.user.name,
          role: "DIRECTOR",
          personalitySummary: dp.personalitySummary,
          leadershipSummary: dp.leadershipSummary,
          forecastingSummary: dp.forecastingSummary,
          communicationSummary: null,
          enneagramType: dp.enneagramType,
          discProfile: dp.discProfile,
          mbtiType: dp.mbtiType,
          strengths: (dp.strengthsJson as string[]) ?? [],
          weaknesses: (dp.weaknessesJson as string[]) ?? [],
          skillScores: dp.skillScores.map((s) => ({ category: s.category, score: s.score })),
          motivations: (dp.motivations as string[]) ?? [],
        },
        prepDocText,
        teamRoster,
      } as any,
      dp.org?.aiModel,
    );

    await prisma.oneOnOnePrep.update({
      where: { id: prepId },
      data: {
        generatedJson: result as any,
        status: "READY" as any,
        modelUsed: dp.org?.aiModel || process.env.GROK_MODEL || "default",
        completedAt: new Date(),
      },
    });
  } catch (err: any) {
    console.error("[director 1:1-prep background] generation failed:", err);
    await prisma.oneOnOnePrep.update({
      where: { id: prepId },
      data: {
        status: "FAILED" as any,
        errorMessage: err?.message ?? "AI generation failed.",
        completedAt: new Date(),
      },
    }).catch(() => null);
  }
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN", "VP_SALES");
  const access = await assertCanAccessDirector(ctx, params.id);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const preps = await prisma.oneOnOnePrep.findMany({
    where: { directorProfileId: params.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      prepDocFilename: true,
      generatedJson: true,
      createdAt: true,
      status: true,
      errorMessage: true,
      startedAt: true,
      completedAt: true,
      preparedBy: { select: { name: true } },
    },
  });
  return NextResponse.json({ preps: preps.map((p) => ({ ...p, director: p.preparedBy })) });
}
