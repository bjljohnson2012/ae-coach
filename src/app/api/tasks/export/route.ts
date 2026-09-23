/**
 * GET /api/tasks/export?format=md|json — exports current open tasks for the user.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, getAccessibleAeIds } from "@/lib/tenancy";

export async function GET(req: Request) {
  const ctx = await requireSession();
  const { searchParams } = new URL(req.url);
  const format = (searchParams.get("format") ?? "md").toLowerCase();

  let aeIds: string[] = [];
  if (ctx.role === "AE") {
    const ae = await prisma.aeProfile.findUnique({ where: { userId: ctx.userId } });
    if (ae) aeIds = [ae.id];
  } else {
    aeIds = await getAccessibleAeIds(ctx);
  }

  const tasks = aeIds.length === 0
    ? []
    : await prisma.task.findMany({
        where: { aeProfileId: { in: aeIds }, status: { in: ["OPEN", "IN_PROGRESS"] } },
        include: { aeProfile: { include: { user: { select: { name: true } } } } },
        orderBy: { dueAt: "asc" },
      });

  if (format === "json") {
    return NextResponse.json({ tasks });
  }

  // Markdown
  const lines: string[] = [];
  lines.push(`# Tasks · ${new Date().toLocaleDateString()}`);
  lines.push("");
  lines.push(`**${ctx.name}** · ${tasks.length} open`);
  lines.push("");
  for (const t of tasks) {
    lines.push(`## ${t.title}`);
    if (ctx.role !== "AE") lines.push(`*For: ${t.aeProfile?.user.name ?? "—"}*`);
    if (t.dueAt) lines.push(`Due: ${t.dueAt.toISOString().slice(0, 10)}`);
    lines.push("");
    if (t.description) {
      lines.push(t.description);
      lines.push("");
    }
  }
  const md = lines.join("\n");
  return new NextResponse(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="tasks-${new Date().toISOString().slice(0, 10)}.md"`,
    },
  });
}
