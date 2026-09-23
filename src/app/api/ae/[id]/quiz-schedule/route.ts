/**
 * Per-AE recurring quiz schedule.
 *
 * GET    — current schedule (or null)
 * POST   — create or update (upsert)
 * DELETE — turn off (sets active=false; preserves history)
 *
 * Body for POST:
 *   { active, cadence, questionsPerQuiz, focusAreas[], expiresAfterDays, notesToRecipient?, titleTemplate? }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, assertCanAccessAe } from "@/lib/tenancy";
import { nextRunAfter } from "@/lib/quizSchedule";

const Body = z.object({
  active: z.boolean().default(true),
  cadence: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY"]).default("MONTHLY"),
  questionsPerQuiz: z.number().int().min(3).max(25).default(8),
  focusAreas: z.array(z.string()).max(20).default([]),
  expiresAfterDays: z.number().int().min(1).max(60).default(14),
  notesToRecipient: z.string().max(2000).nullable().optional(),
  titleTemplate: z.string().max(120).nullable().optional(),
  // If provided, use this as the first run instead of the default cadence offset.
  // Useful for "start in 1 week" UI affordance.
  firstRunAt: z.string().datetime().optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN", "AE");
  if (ctx.role === "AE") {
    const ae = await prisma.aeProfile.findUnique({ where: { id: params.id }, select: { userId: true } });
    if (ae?.userId !== ctx.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else {
    const access = await assertCanAccessAe(ctx, params.id);
    if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const schedule = await prisma.recurringQuizSchedule.findUnique({
    where: { aeProfileId: params.id },
    include: { createdBy: { select: { name: true } } },
  });
  return NextResponse.json({ schedule });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const access = await assertCanAccessAe(ctx, params.id);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  const nextRunAt = data.firstRunAt ? new Date(data.firstRunAt) : nextRunAfter(new Date(), data.cadence);

  const schedule = await prisma.recurringQuizSchedule.upsert({
    where: { aeProfileId: params.id },
    update: {
      active: data.active,
      cadence: data.cadence,
      questionsPerQuiz: data.questionsPerQuiz,
      focusAreas: data.focusAreas as any,
      expiresAfterDays: data.expiresAfterDays,
      notesToRecipient: data.notesToRecipient ?? null,
      titleTemplate: data.titleTemplate ?? null,
      // Only push nextRunAt forward when reactivating or first creating;
      // don't reset it on minor edits unless caller passes firstRunAt.
      ...(data.firstRunAt ? { nextRunAt } : {}),
    },
    create: {
      aeProfileId: params.id,
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
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const access = await assertCanAccessAe(ctx, params.id);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.recurringQuizSchedule.update({
    where: { aeProfileId: params.id },
    data: { active: false },
  }).catch(() => null);
  return NextResponse.json({ ok: true });
}
