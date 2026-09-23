/**
 * GET /api/analyze/stat?kind=<orgs|users|aes|products|articles|files|questions|reviews|tasks>
 * Returns the underlying entity list for an analyze stat card.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";

export async function GET(req: Request) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN", "VP_SALES", "DIRECTOR");
  const orgFilter = ctx.role === "ORG_ADMIN" ? {} : { orgId: ctx.effectiveOrgId };

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? "users";

  let title = "";
  let subtitle = "";
  let viewAllHref = "/admin/analyze";
  let rows: Array<{ id: string; title: string; subtitle?: string; href?: string; meta?: string }> = [];

  if (kind === "orgs") {
    title = "Customer orgs";
    subtitle = "All organizations in the platform.";
    viewAllHref = "/admin/orgs";
    const orgs = await prisma.org.findMany({
      where: ctx.role === "ORG_ADMIN" ? {} : { id: ctx.effectiveOrgId },
      include: { _count: { select: { users: true, products: true, knowledgeArticles: true } } },
      orderBy: { name: "asc" },
    });
    rows = orgs.map((o: any) => ({
      id: o.id,
      title: o.name,
      subtitle: `${o._count.users} users · ${o._count.products} products · ${o._count.knowledgeArticles} articles`,
      href: `/admin/orgs/${o.id}/edit`,
    }));
  } else if (kind === "users") {
    title = "Users";
    subtitle = ctx.role === "ORG_ADMIN" ? "Across all orgs." : "In your org.";
    viewAllHref = "/admin/users";
    const users = await prisma.user.findMany({
      where: orgFilter,
      orderBy: [{ role: "asc" }, { name: "asc" }],
      take: 200,
    });
    rows = users.map((u) => ({
      id: u.id,
      title: u.name,
      subtitle: `${u.role.replace(/_/g, " ").toLowerCase()} · ${u.email}`,
      meta: u.status,
    }));
  } else if (kind === "aes") {
    title = "AEs";
    subtitle = "All AEs in scope.";
    viewAllHref = "/dashboard";
    const aes = await prisma.aeProfile.findMany({
      where: orgFilter,
      include: { user: { select: { name: true, email: true } }, director: { select: { name: true } }, skillScores: true },
      orderBy: { user: { name: "asc" } },
      take: 200,
    });
    rows = aes.map((a: any) => {
      const avg = a.skillScores.length > 0 ? Math.round(a.skillScores.reduce((s: number, x: any) => s + x.score, 0) / a.skillScores.length) : null;
      return {
        id: a.id,
        title: a.user.name,
        subtitle: a.director?.name ? `reports to ${a.director.name}` : a.user.email,
        meta: avg !== null ? `avg ${avg}` : "no scores yet",
        href: `/director/ae/${a.id}`,
      };
    });
  } else if (kind === "products") {
    title = "Products";
    subtitle = "Active products.";
    viewAllHref = "/director/products";
    const products = await prisma.product.findMany({
      where: { ...orgFilter, active: true },
      orderBy: { name: "asc" },
    });
    rows = products.map((p) => ({
      id: p.id,
      title: p.name,
      subtitle: p.summary?.slice(0, 100) || p.audience || "",
      href: `/director/products`,
    }));
  } else if (kind === "articles") {
    title = "Knowledge articles";
    subtitle = "Approved + pending in your scope.";
    viewAllHref = "/director/knowledge";
    const articles = await prisma.knowledgeArticle.findMany({
      where: orgFilter,
      include: { repository: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    rows = articles.map((a) => ({
      id: a.id,
      title: a.title,
      subtitle: `${a.repository.name} · ${a.status.toLowerCase()}`,
      meta: a.updatedAt.toLocaleDateString(),
      href: `/director/knowledge/articles/${a.id}`,
    }));
  } else if (kind === "files") {
    title = "Files";
    subtitle = "Uploaded coaching artifacts.";
    viewAllHref = "/director/files";
    const files = await prisma.fileAsset.findMany({
      where: orgFilter,
      include: { aeProfile: { include: { user: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    rows = files.map((f: any) => ({
      id: f.id,
      title: f.filename,
      subtitle: f.aeProfile?.user?.name ? `linked to ${f.aeProfile.user.name}` : f.kind.toLowerCase(),
      meta: `${(f.sizeBytes / 1024).toFixed(0)} KB`,
      href: `/director/files/${f.id}`,
    }));
  } else if (kind === "questions") {
    title = "Active questions";
    subtitle = "Question bank for your org + global pool.";
    viewAllHref = "/director/questions";
    const questions = await prisma.question.findMany({
      where: { OR: [{ orgId: ctx.effectiveOrgId }, { orgId: null }], active: true },
      orderBy: [{ category: "asc" }, { orderHint: "asc" }],
      take: 200,
    });
    rows = questions.map((q) => ({
      id: q.id,
      title: q.text.length > 90 ? q.text.slice(0, 90) + "…" : q.text,
      subtitle: `${q.category.replace(/_/g, " ")} · ${q.questionType.toLowerCase().replace("_", " ")}`,
      href: `/director/questions/${q.id}/edit`,
    }));
  } else if (kind === "reviews") {
    title = "Reviews";
    subtitle = "Director monthly reviews.";
    viewAllHref = "/director/reviews";
    const reviews = await prisma.directorReview.findMany({
      where: { aeProfile: orgFilter },
      include: {
        director: { select: { name: true } },
        aeProfile: { include: { user: { select: { name: true } } } },
      },
      orderBy: { monthOf: "desc" },
      take: 100,
    });
    rows = reviews.map((r: any) => ({
      id: r.id,
      title: r.aeProfile.user.name,
      subtitle: `${new Date(r.monthOf).toLocaleDateString(undefined, { year: "numeric", month: "long" })} · ${r.status.toLowerCase()}`,
      meta: `by ${r.director.name}`,
      href: `/director/ae/${r.aeProfileId}`,
    }));
  } else if (kind === "tasks") {
    title = "Open tasks";
    subtitle = "OPEN + IN_PROGRESS across your scope.";
    viewAllHref = "/tasks";
    const tasks = await prisma.task.findMany({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS"] },
        OR: [
          { aeProfile: orgFilter },
          { assignee: orgFilter },
        ],
      },
      include: {
        aeProfile: { include: { user: { select: { name: true } } } },
        assignee: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    rows = tasks.map((t: any) => ({
      id: t.id,
      title: t.title,
      subtitle: t.aeProfile?.user?.name ?? t.assignee?.name ?? "—",
      meta: t.dueAt ? `due ${new Date(t.dueAt).toLocaleDateString()}` : t.status.toLowerCase(),
    }));
  }

  return NextResponse.json({ kind, title, subtitle, rows, viewAllHref });
}
