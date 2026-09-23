import { requireSession, getAccessibleAeIds, getManageableUsers } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { TaskTools } from "./TaskTools";
import { GenerateTasksForUserButton } from "@/components/GenerateTasksForUserButton";
import { RetakeRequestsCard } from "./RetakeRequestsCard";
import { TaskListView, type TaskRow } from "./TaskListView";

/**
 * Tasks page — three buckets:
 *   1. For me              — tasks assigned to me (aeProfileId or assigneeUserId)
 *   2. For my team         — tasks assigned to AEs / users I manage (leader-only)
 *   3. Assigned by me      — tasks I created for someone else (leader-only)
 *
 * v3.37.2: each task is tagged with `isDirect` (true if the assignee is one of
 * the current user's direct reports). The client view uses this to power the
 * scope toggle ("Direct reports" vs "Everyone"). Default scope by role:
 *   - VP_SALES → DIRECT (cuts through hundreds of AE-level tasks)
 *   - DIRECTOR → DIRECT but no toggle (their direct reports ARE their team)
 *   - COMPANY_ADMIN / ORG_ADMIN → ALL (no useful direct-report concept)
 */
export default async function TasksPage() {
  const ctx = await requireSession();

  // Resolve "what's mine"
  const myAe = ctx.role === "AE"
    ? await prisma.aeProfile.findUnique({ where: { userId: ctx.userId }, select: { id: true } })
    : null;
  const myAeId = myAe?.id ?? null;

  // Manageable scope (leaders only)
  const manageable = ctx.role === "AE" ? [] : await getManageableUsers(ctx);
  const managedUserIds = manageable.map((u) => u.id).filter((id) => id !== ctx.userId);

  const aeIds = ctx.role === "AE"
    ? (myAeId ? [myAeId] : [])
    : await getAccessibleAeIds(ctx);

  // ------------------------------------------------------------
  // Compute "direct report" user IDs based on the current user's role.
  // Used to tag tasks → powers the client-side scope filter.
  // ------------------------------------------------------------
  let directReportUserIds = new Set<string>();
  if (ctx.role === "DIRECTOR") {
    // AEs whose AeProfile.directorId points at me → grab their userIds.
    const aes = await prisma.aeProfile.findMany({
      where: { directorId: ctx.userId },
      select: { user: { select: { id: true } } },
    });
    directReportUserIds = new Set(aes.map((a: { user: { id: string } }) => a.user.id));
  } else if (ctx.role === "VP_SALES") {
    // Users (typically directors) whose User.vpId points at me.
    const reports = await prisma.user.findMany({
      where: { vpId: ctx.userId },
      select: { id: true },
    });
    directReportUserIds = new Set(reports.map((r: { id: string }) => r.id));
  }
  // COMPANY_ADMIN / ORG_ADMIN: no direct-report concept; toggle defaults to ALL.

  // One unified query covering all three buckets.
  const orFilters: any[] = [];
  if (myAeId) orFilters.push({ aeProfileId: myAeId });
  orFilters.push({ assigneeUserId: ctx.userId });
  if (ctx.role !== "AE") {
    if (aeIds.length > 0) orFilters.push({ aeProfileId: { in: aeIds } });
    if (managedUserIds.length > 0) orFilters.push({ assigneeUserId: { in: managedUserIds } });
    orFilters.push({ createdByUserId: ctx.userId });
  }

  const allTasks = await prisma.task.findMany({
    where: { status: { not: "CANCELLED" }, OR: orFilters },
    include: {
      aeProfile: { include: { user: { select: { id: true, name: true } } } },
      assignee: { select: { id: true, name: true, role: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
  });

  // ------------------------------------------------------------
  // Enrich each task with urgency, owner labels, and isDirect.
  // ------------------------------------------------------------
  type Urgency = TaskRow["urgency"];
  const URGENCY_ORDER: Record<Urgency, number> = { OVERDUE: 0, URGENT: 1, HIGH: 2, MEDIUM: 3, LOW: 4 };
  const now = Date.now();

  function enrich(t: typeof allTasks[number]): TaskRow {
    const dueMs = t.dueAt?.getTime();
    const days = dueMs ? Math.round((dueMs - now) / 86_400_000) : null;
    let urgency: Urgency = "LOW";
    if (days !== null) {
      if (days < 0) urgency = "OVERDUE";
      else if (days <= 3) urgency = "URGENT";
      else if (days <= 7) urgency = "HIGH";
      else if (days <= 21) urgency = "MEDIUM";
    }
    const targetUserId = t.aeProfile?.user.id ?? t.assigneeUserId ?? null;
    const isDirect = targetUserId ? directReportUserIds.has(targetUserId) : false;
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      dueAt: t.dueAt,
      status: t.status,
      completedAt: t.completedAt,
      createdAt: t.createdAt,
      urgency,
      days,
      isDirect,
      ownerName: t.aeProfile?.user.name ?? t.assignee?.name ?? null,
      creatorName: t.createdBy?.name ?? null,
    };
  }

  const enriched = allTasks.map(enrich);

  // Partition.
  const forMe: TaskRow[] = [];
  const forTeam: TaskRow[] = [];
  const byMe: TaskRow[] = [];

  for (let i = 0; i < allTasks.length; i++) {
    const raw = allTasks[i];
    const t = enriched[i];
    if (t.status === "DONE" || t.status === "CANCELLED") continue;
    if (t.status !== "OPEN" && t.status !== "IN_PROGRESS") continue;

    const targetIsMe =
      (myAeId && raw.aeProfileId === myAeId) ||
      raw.assigneeUserId === ctx.userId;
    const createdByMe = raw.createdByUserId === ctx.userId;

    if (targetIsMe) forMe.push(t);
    else if (createdByMe) byMe.push(t);
    else forTeam.push(t);
  }

  forMe.sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency]);
  forTeam.sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency]);
  byMe.sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency]);

  // Completed — group by month.
  const done = enriched.filter((t: TaskRow) => t.status === "DONE");
  const doneMap: Record<string, TaskRow[]> = {};
  for (const t of done) {
    const key = (t.completedAt ?? t.createdAt).toISOString().slice(0, 7);
    (doneMap[key] ||= []).push(t);
  }
  const doneByMonth = Object.keys(doneMap)
    .sort()
    .reverse()
    .map((key) => ({ key, tasks: doneMap[key] }));

  // For TaskTools.
  const aes = aeIds.length === 0
    ? []
    : await prisma.aeProfile.findMany({
        where: { id: { in: aeIds } },
        include: { user: { select: { name: true } } },
      });

  const isLeader = ctx.role !== "AE";

  return (
    <div className="page">
      <header className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="eyebrow mb-2">Tasks</div>
          <h1 className="h-page">{ctx.role === "AE" ? "Your action list" : "Tasks"}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {ctx.role === "AE"
              ? "Specific actions to grow your skills, ordered by urgency."
              : "Yours, your team's, and the ones you've delegated."}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <GenerateTasksForUserButton buttonLabel="✨ For user" buttonClassName="btn-primary text-sm" />
          <TaskTools
            aes={aes.map((a: { id: string; user: { name: string } }) => ({ id: a.id, name: a.user.name }))}
            defaultAeId={ctx.role === "AE" ? myAeId : null}
          />
        </div>
      </header>

      {isLeader && <RetakeRequestsCard />}

      <TaskListView
        role={ctx.role as "AE" | "DIRECTOR" | "VP_SALES" | "COMPANY_ADMIN" | "ORG_ADMIN"}
        forMe={forMe}
        forTeam={forTeam}
        byMe={byMe}
        doneByMonth={doneByMonth}
      />
    </div>
  );
}
