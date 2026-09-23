/**
 * POST /api/ae/[id]/chat
 * Body: { question: string, history?: Array<{role, content}> }
 * Returns: { reply: string }
 *
 * Stateless: caller maintains the chat history client-side and re-sends it.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, assertCanAccessAe } from "@/lib/tenancy";
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
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const access = await assertCanAccessAe(ctx, params.id);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const ae = await prisma.aeProfile.findUnique({
    where: { id: params.id },
    include: {
      user: { select: { name: true } },
      skillScores: true,
      coachingNotes: { orderBy: { createdAt: "desc" }, take: 5, select: { createdAt: true, content: true } },
    },
  });
  if (!ae) return NextResponse.json({ error: "AE not found" }, { status: 404 });

  const reply = await chatWithProfile({
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
    history: parsed.data.history,
    question: parsed.data.question,
  });

  return NextResponse.json({ reply });
}
