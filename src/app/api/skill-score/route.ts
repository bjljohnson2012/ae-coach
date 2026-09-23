import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, assertCanAccessAe } from "@/lib/tenancy";
import { scoreToLevel } from "@/lib/scoring";

const Body = z.object({
  aeProfileId: z.string(),
  category: z.enum([
    "DISCOVERY",
    "OBJECTION_HANDLING",
    "CLOSING",
    "COMMUNICATION",
    "RESILIENCE",
    "PRODUCT_MASTERY",
  ]),
  score: z.number().int().min(0).max(100),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  const ctx = await requireRole("DIRECTOR", "ORG_ADMIN");
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const access = await assertCanAccessAe(ctx, parsed.data.aeProfileId);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { aeProfileId, category, score, notes } = parsed.data;

  await prisma.skillScore.upsert({
    where: { aeProfileId_category: { aeProfileId, category } },
    update: {
      score,
      level: scoreToLevel(score),
      source: "DIRECTOR_OVERRIDE",
      lastUpdatedByUserId: ctx.userId,
      lastUpdatedAt: new Date(),
      notes,
    },
    create: {
      aeProfileId,
      category,
      score,
      level: scoreToLevel(score),
      source: "DIRECTOR_OVERRIDE",
      lastUpdatedByUserId: ctx.userId,
      notes,
    },
  });
  await prisma.skillScoreHistory.create({
    data: { aeProfileId, category, score, source: "DIRECTOR_OVERRIDE" },
  });
  return NextResponse.json({ ok: true });
}
