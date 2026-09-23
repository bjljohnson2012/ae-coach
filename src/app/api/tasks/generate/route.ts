/**
 * POST /api/tasks/generate
 * Body: { aeProfileId, count? }
 * Pulls AE profile + skill scores, calls Grok, creates Task rows.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, assertCanAccessAe } from "@/lib/tenancy";
import { generateTasksForAe } from "@/lib/ai";

const Body = z.object({
  aeProfileId: z.string(),
  count: z.number().int().min(1).max(10).default(5),
});

export async function POST(req: Request) {
  const ctx = await requireSession();
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const access = await assertCanAccessAe(ctx, parsed.data.aeProfileId);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ae = await prisma.aeProfile.findUnique({
    where: { id: parsed.data.aeProfileId },
    include: { user: true, skillScores: true, tasks: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } } } },
  });
  if (!ae) return NextResponse.json({ error: "AE not found" }, { status: 404 });

  const drafts = await generateTasksForAe({
    aeName: ae.user.name,
    strengths: (ae.strengthsJson as string[]) ?? [],
    weaknesses: (ae.weaknessesJson as string[]) ?? [],
    skillScores: ae.skillScores.map((s) => ({ category: s.category, score: s.score })),
    existingOpenTasks: ae.tasks.map((t) => ({ title: t.title })),
    count: parsed.data.count,
  });

  // Persist
  const created = [];
  for (const d of drafts) {
    const due = new Date();
    due.setDate(due.getDate() + Math.max(0, Math.min(90, d.dueInDays ?? 14)));
    const task = await prisma.task.create({
      data: {
        aeProfileId: ae.id,
        createdByUserId: ctx.userId,
        title: d.title,
        description: `${d.description}\n\n_Why this matters:_ ${d.rationale}`,
        dueAt: due,
        status: "OPEN",
      },
    });
    created.push(task);
  }

  return NextResponse.json({ tasks: created });
}
