/**
 * POST /api/users/[id]/coaching-plans  → build a new plan (background job)
 * GET  /api/users/[id]/coaching-plans  → list all plans for this user
 *
 * Permission:
 *   - Self: any user can build a plan for themselves.
 *   - Leaders: can build a plan for users in their reporting tree (or their org for COMPANY_ADMIN+).
 *
 * The plan is generated in the background. POST returns the row ID immediately;
 * the client polls GET /api/coaching-plans/[planId] for status. When the plan
 * lands, weeklyMoves become Task records owned by the subject user.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, assertCanAccessAe, assertCanAccessDirector } from "@/lib/tenancy";
import { generateCoachingPlan } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireSession();

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    include: {
      aeProfile: { include: { skillScores: true } },
      directorProfile: { include: { skillScores: true } },
      org: { select: { aiModel: true } },
    },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Authorization: self OR leader-with-access
  const isSelf = target.id === ctx.userId;
  if (!isSelf) {
    if (target.aeProfile) {
      const ok = await assertCanAccessAe(ctx, target.aeProfile.id);
      if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    } else if (target.directorProfile) {
      const ok = await assertCanAccessDirector(ctx, target.directorProfile.id);
      if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    } else {
      // No profile yet — only super admin can build a plan with empty inputs
      if (ctx.role !== "ORG_ADMIN") return NextResponse.json({ error: "Target has no profile yet" }, { status: 400 });
    }
  }

  const profile = target.aeProfile ?? target.directorProfile;
  if (!profile) {
    return NextResponse.json(
      { error: "This user hasn't completed their intake yet. They need a synthesized profile before a coaching plan can be built." },
      { status: 400 }
    );
  }

  // Create the row immediately, return ID, run AI in background.
  const plan = await prisma.coachingPlan.create({
    data: {
      aeProfileId: target.aeProfile?.id,
      directorProfileId: target.directorProfile?.id,
      builtByUserId: ctx.userId,
      status: "GENERATING" as any,
      generatedJson: {},
    },
    select: { id: true, status: true, startedAt: true },
  });

  void runCoachingPlanInBackground(plan.id, target.id);

  return NextResponse.json({
    plan: { id: plan.id, status: plan.status, startedAt: plan.startedAt },
    message: "Coaching plan is being built — safe to navigate away.",
  });
}

async function runCoachingPlanInBackground(planId: string, userId: string) {
  try {
    const target = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        aeProfile: {
          include: {
            skillScores: true,
            coachingNotes: { orderBy: { createdAt: "desc" }, take: 5, select: { content: true, createdAt: true } },
          },
        },
        directorProfile: { include: { skillScores: true } },
        org: { select: { aiModel: true } },
      },
    });
    if (!target) throw new Error("User vanished");
    const profile = target.aeProfile ?? target.directorProfile;
    if (!profile) throw new Error("No profile to base plan on");

    const isAe = !!target.aeProfile;

    const result = await generateCoachingPlan(
      {
        name: target.name,
        role: target.role as any,
        enneagramType: profile.enneagramType,
        discProfile: profile.discProfile,
        mbtiType: profile.mbtiType,
        personalitySummary: profile.personalitySummary,
        strengths: (profile.strengthsJson as string[]) ?? [],
        weaknesses: (profile.weaknessesJson as string[]) ?? [],
        motivations: (profile.motivations as string[]) ?? [],
        skillScores: profile.skillScores.map((s: any) => ({ category: s.category, score: s.score })),
        recentNotes: isAe
          ? (target.aeProfile!.coachingNotes ?? []).map((n: any) => ({
              date: n.createdAt.toISOString().slice(0, 10),
              content: n.content,
            }))
          : undefined,
      },
      target.org?.aiModel,
    );

    // Spawn tasks from each weeklyMove. Tasks count toward the dashboard badge.
    const taskCreates: Array<Promise<any>> = [];
    for (const area of result.growthAreas) {
      for (const move of area.weeklyMoves) {
        taskCreates.push(
          prisma.task.create({
            data: {
              creatorUserId: target.id,    // self-assigned; subject is also creator
              assigneeUserId: target.id,
              aeProfileId: target.aeProfile?.id ?? null,
              title: move,
              description: `From your "${result.title}" coaching plan — area: ${area.area}.\n\n${area.why}`,
              status: "OPEN",
              priority: "MEDIUM",
              source: "AI_GENERATED" as any,
            } as any,
          }).catch((err: any) => {
            console.warn("[coaching-plan] task create failed:", err?.message);
          }),
        );
      }
    }
    const tasks = await Promise.all(taskCreates);
    const tasksCreated = tasks.filter(Boolean).length;

    await prisma.coachingPlan.update({
      where: { id: planId },
      data: {
        title: result.title,
        generatedJson: result as any,
        status: "READY" as any,
        modelUsed: target.org?.aiModel || process.env.GROK_MODEL || "default",
        tasksSpawned: tasksCreated,
        completedAt: new Date(),
      },
    });
  } catch (err: any) {
    console.error("[coaching-plan background] failed:", err);
    await prisma.coachingPlan.update({
      where: { id: planId },
      data: {
        status: "FAILED" as any,
        errorMessage: err?.message ?? "AI generation failed.",
        completedAt: new Date(),
      },
    }).catch(() => null);
  }
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireSession();

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      aeProfile: { select: { id: true } },
      directorProfile: { select: { id: true } },
    },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Permission check
  const isSelf = target.id === ctx.userId;
  if (!isSelf) {
    if (target.aeProfile) {
      const ok = await assertCanAccessAe(ctx, target.aeProfile.id);
      if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    } else if (target.directorProfile) {
      const ok = await assertCanAccessDirector(ctx, target.directorProfile.id);
      if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const where = target.aeProfile
    ? { aeProfileId: target.aeProfile.id }
    : target.directorProfile
      ? { directorProfileId: target.directorProfile.id }
      : { id: "__none__" };

  const plans = await prisma.coachingPlan.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { builtBy: { select: { name: true } } },
  });

  // Decorate each plan with `unread` (subject hasn't read yet).
  const decorated = plans.map((p: any) => {
    const readBy = Array.isArray(p.readByJson) ? (p.readByJson as string[]) : [];
    return {
      ...p,
      unread: !readBy.includes(target.id),
    };
  });

  return NextResponse.json({ plans: decorated });
}
