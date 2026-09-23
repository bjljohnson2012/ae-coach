/**
 * Per-director recurring quiz schedule. Mirrors AE version.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, assertCanAccessDirector } from "@/lib/tenancy";
import { nextRunAfter } from "@/lib/quizSchedule";

const Body = z.object({
  active: z.boolean().default(true),
  cadence: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY"]).default("MONTHLY"),
  questionsPerQuiz: z.number().int().min(3).max(25).default(8),
  focusAreas: z.array(z.string()).max(20).default([]),
  expiresAfterDays: z.number().int().min(1).max(60).default(14),
  notesToRecipient: z.string().max(2000).nullable().optional(),
  titleTemplate: z.string().max(120).nullable().optional(),
  firstRunAt: z.string().datetime().optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN", "VP_SALES", "DIRECTOR");
  const access = await assertCanAccessDirector(ctx, params.id);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const schedule = await prisma.recurringQuizSchedule.findUnique({
    where: { directorProfileId: params.id },
    include: { createdBy: { select: { name: true } } },
  });
  return NextResponse.json({ schedule });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN", "VP_SALES");
  const access = await assertCanAccessDirector(ctx, params.id);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  const nextRunAt = data.firstRunAt ? new Date(data.firstRunAt) : nextRunAfter(new Date(), data.cadence);

  const schedule = await prisma.recurringQuizSchedule.upsert({
    where: { directorProfileId: params.id },
    update: {
      active: data.active,
      cadence: data.cadence,
      questionsPerQuiz: data.questionsPerQuiz,
      focusAreas: data.focusAreas as any,
      expiresAfterDays: data.expiresAfterDays,
      notesToRecipient: data.notesToRecipient ?? null,
      titleTemplate: data.titleTemplate ?? null,
      ...(data.firstRunAt ? { nextRunAt } : {}),
    },
    create: {
      directorProfileId: params.id,
      createdByUserId: ctx.userId,
      active: data.active,
      cadence: data.cadence,
      questionsPerQuiz: data.questionsPerQuiz,
      focusAreas: data.focusAreas as any,
      expiresAfterDays: data.expiresAfterDays,
      notesToRecipient: data.notesToRecipient ?? null,
      titleTemplate: data.titleTemplate ?? null,
      nextRunAt,
    },
  });
  return NextResponse.json({ schedule });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN", "VP_SALES");
  const access = await assertCanAccessDirector(ctx, params.id);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.recurringQuizSchedule.update({
    where: { directorProfileId: params.id },
    data: { active: false },
  }).catch(() => null);
  return NextResponse.json({ ok: true });
}
