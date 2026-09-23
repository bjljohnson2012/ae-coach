/**
 * POST /api/ae/[id]/quiz-schedule/actions
 * Body: { action: "skip" | "sendNow" }
 *
 * skip:    advances nextRunAt by one cadence period (skips the upcoming send)
 * sendNow: sets nextRunAt to now so the next cron run picks it up immediately
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, assertCanAccessAe } from "@/lib/tenancy";
import { nextRunAfter } from "@/lib/quizSchedule";

const Body = z.object({ action: z.enum(["skip", "sendNow"]) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const access = await assertCanAccessAe(ctx, params.id);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const schedule = await prisma.recurringQuizSchedule.findUnique({ where: { aeProfileId: params.id } });
  if (!schedule) return NextResponse.json({ error: "No schedule" }, { status: 404 });

  let nextRunAt: Date;
  if (parsed.data.action === "skip") {
    nextRunAt = nextRunAfter(schedule.nextRunAt, schedule.cadence as any);
  } else {
    nextRunAt = new Date(Date.now() - 60 * 1000); // one minute ago — cron picks up next tick
  }

  const updated = await prisma.recurringQuizSchedule.update({
    where: { id: schedule.id },
    data: { nextRunAt },
  });

  return NextResponse.json({ schedule: updated });
}
