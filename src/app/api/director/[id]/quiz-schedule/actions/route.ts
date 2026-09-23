/**
 * Director equivalent of /api/ae/[id]/quiz-schedule/actions.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, assertCanAccessDirector } from "@/lib/tenancy";
import { nextRunAfter } from "@/lib/quizSchedule";

const Body = z.object({ action: z.enum(["skip", "sendNow"]) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN", "VP_SALES");
  const access = await assertCanAccessDirector(ctx, params.id);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const schedule = await prisma.recurringQuizSchedule.findUnique({ where: { directorProfileId: params.id } });
  if (!schedule) return NextResponse.json({ error: "No schedule" }, { status: 404 });

  let nextRunAt: Date;
  if (parsed.data.action === "skip") {
    nextRunAt = nextRunAfter(schedule.nextRunAt, schedule.cadence as any);
  } else {
    nextRunAt = new Date(Date.now() - 60 * 1000);
  }

  const updated = await prisma.recurringQuizSchedule.update({
    where: { id: schedule.id },
    data: { nextRunAt },
  });

  return NextResponse.json({ schedule: updated });
}
