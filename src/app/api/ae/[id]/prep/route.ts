/**
 * POST /api/ae/[id]/prep   (multipart/form-data with `file`)
 *   or /api/ae/[id]/prep   (application/json with { prepDocText })
 *
 * Background-job pattern:
 *   1. Create the OneOnOnePrep row immediately with status=GENERATING.
 *   2. Return the row ID right away — the client can navigate freely.
 *   3. Kick off the AI work via a fire-and-forget promise. Node.js keeps
 *      the function running to completion in the same process; there's no
 *      HTTP timeout because the response has already been sent.
 *   4. When done, the row gets updated with the result (READY) or error (FAILED).
 *   5. The client polls GET /api/ae/[id]/prep/[prepId] until status flips.
 *
 * GET /api/ae/[id]/prep — list prior preps (newest first).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, assertCanAccessAe } from "@/lib/tenancy";
import { extractText } from "@/lib/files";
import { generateOneOnOnePrep } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 300; // up to 5 min for the background promise

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const access = await assertCanAccessAe(ctx, params.id);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Accept either a multipart upload or a JSON body with prepDocText.
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
      return NextResponse.json({ error: `Could not extract text from ${file.name}: ${e?.message ?? "unknown"}` }, { status: 422 });
    }
    if (!prepDocText || prepDocText.length < 30) {
      return NextResponse.json({ error: "Extracted text was empty. Try a different format (PDF or DOCX)." }, { status: 422 });
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
      aeProfileId: params.id,
      preparedByUserId: ctx.userId,
      prepDocFilename,
      prepDocText: prepDocText.slice(0, 50000),
      generatedJson: {},
      status: "GENERATING" as any,
      modelUsed: "pending",
    },
    select: { id: true, status: true, startedAt: true },
  });

  // Fire-and-forget the AI work. Node keeps this running after we return.
  // Errors are caught and persisted so the row never stays GENERATING forever.
  void runPrepInBackground(prep.id, params.id, prepDocText);

  return NextResponse.json({
    prep: { id: prep.id, status: prep.status, startedAt: prep.startedAt },
    message: "Prep is generating — the result will be ready when you come back. Safe to navigate away.",
  });
}

async function runPrepInBackground(prepId: string, aeProfileId: string, prepDocText: string) {
  try {
    const ae = await prisma.aeProfile.findUnique({
      where: { id: aeProfileId },
      include: {
        user: { select: { name: true } },
        skillScores: true,
        coachingNotes: { orderBy: { createdAt: "desc" }, take: 5, select: { createdAt: true, content: true } },
        directorReviews: { orderBy: { monthOf: "desc" }, take: 3, select: { monthOf: true, summary: true } },
        org: { select: { aiModel: true } },
      },
    });
    if (!ae) throw new Error("AE not found");

    const products = await prisma.product.findMany({
      where: { orgId: ae.orgId, active: true },
      select: { name: true },
      take: 10,
    });

    const result = await generateOneOnOnePrep(
      {
        aeProfile: {
          name: ae.user.name,
          personalitySummary: ae.personalitySummary,
          salesStyleSummary: ae.salesStyleSummary,
          communicationSummary: ae.communicationSummary,
          enneagramType: ae.enneagramType,
          discProfile: ae.discProfile,
          mbtiType: ae.mbtiType,
          strengths: (ae.strengthsJson as string[]) ?? [],
          weaknesses: (ae.weaknessesJson as string[]) ?? [],
          skillScores: ae.skillScores.map((s) => ({ category: s.category, score: s.score })),
          motivations: (ae.motivations as string[]) ?? [],
        },
        recentNotes: ae.coachingNotes.map((n) => ({ date: n.createdAt.toISOString().slice(0, 10), content: n.content })),
        recentReviews: ae.directorReviews.map((r) => ({ monthOf: r.monthOf.toISOString().slice(0, 7), summary: r.summary })),
        prepDocText,
        productNames: products.map((p) => p.name),
      },
      ae.org?.aiModel,
    );

    await prisma.oneOnOnePrep.update({
      where: { id: prepId },
      data: {
        generatedJson: result as any,
        status: "READY" as any,
        modelUsed: ae.org?.aiModel || process.env.GROK_MODEL || "default",
        completedAt: new Date(),
      },
    });
  } catch (err: any) {
    console.error("[1:1-prep background] generation failed:", err);
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
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const access = await assertCanAccessAe(ctx, params.id);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const preps = await prisma.oneOnOnePrep.findMany({
    where: { aeProfileId: params.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      prepDocFilename: true,
      generatedJson: true,
      createdAt: true,
      // Background-job fields so the client can render "generating…" rows.
      status: true,
      errorMessage: true,
      startedAt: true,
      completedAt: true,
      preparedBy: { select: { name: true } },
    },
  });
  return NextResponse.json({ preps: preps.map((p) => ({ ...p, director: p.preparedBy })) });
}
