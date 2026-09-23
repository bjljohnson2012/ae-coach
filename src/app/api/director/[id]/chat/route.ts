/**
 * Chat with a director's profile. Mirrors /api/ae/[id]/chat.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, assertCanAccessDirector } from "@/lib/tenancy";
import { chatWithProfile } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 30;

const Body = z.object({
  question: z.string().min(2).max(2000),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(4000),
  })).max(20).default([]),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN", "VP_SALES");
  const access = await assertCanAccessDirector(ctx, params.id);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const dp = await prisma.directorProfile.findUnique({
    where: { id: params.id },
    include: {
      user: { select: { name: true } },
      skillScores: true,
    },
  });
  if (!dp) return NextResponse.json({ error: "Director not found" }, { status: 404 });

  const reply = await chatWithProfile({
    aeProfile: {
      name: dp.user.name,
      personalitySummary: dp.personalitySummary,
      // Reuse the salesStyleSummary slot for leadership context
      salesStyleSummary: dp.leadershipSummary,
      communicationSummary: dp.forecastingSummary,
      enneagramType: dp.enneagramType,
      discProfile: dp.discProfile,
      mbtiType: dp.mbtiType,
      strengths: (dp.strengthsJson as string[]) ?? [],
      weaknesses: (dp.weaknessesJson as string[]) ?? [],
      skillScores: dp.skillScores.map((s) => ({ category: s.category, score: s.score })),
      motivations: (dp.motivations as string[]) ?? [],
    },
    history: parsed.data.history,
    question: parsed.data.question,
  });

  return NextResponse.json({ reply });
}
