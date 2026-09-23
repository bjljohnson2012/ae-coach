/**
 * GET /api/search?q=...
 *
 * Returns matches across people, articles, products, and pages within the
 * caller's accessible scope. Used by the Cmd-K palette.
 *
 * v3.37.3 — every result is permission-filtered. AEs never see:
 *   - other AEs / directors as people-pickers
 *   - admin pages, director-only pages
 *   - personality-repo articles
 *   - non-APPROVED articles
 * AEs land on AE-routable URLs (/knowledge/articles/...), leaders on the
 * existing director-side URLs.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenancy";

export const runtime = "nodejs";

interface ResultItem {
  kind: "ae" | "director" | "article" | "product" | "page";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

// Pages exposed in the palette, with the role gates that can see each.
// Anyone with a session can see "any" pages.
type Role = "ANY" | "LEADER" | "AE_ONLY" | "ADMIN";
const STATIC_PAGES: Array<ResultItem & { audience: Role }> = [
  // AE-accessible
  { audience: "ANY",     kind: "page", id: "tasks",     title: "Tasks",            href: "/tasks" },
  { audience: "ANY",     kind: "page", id: "knowledge", title: "Knowledge",        href: "/knowledge" },
  { audience: "ANY",     kind: "page", id: "improve",   title: "Improve",          href: "/improve" },
  { audience: "ANY",     kind: "page", id: "help",      title: "Help",             href: "/help" },
  { audience: "ANY",     kind: "page", id: "account",   title: "Account Settings", href: "/account" },
  { audience: "AE_ONLY", kind: "page", id: "my-card",   title: "My Card",          href: "/ae/card" },
  { audience: "AE_ONLY", kind: "page", id: "intake",    title: "Intake",           href: "/ae/intake" },
  { audience: "AE_ONLY", kind: "page", id: "quizzes",   title: "Quizzes",          href: "/ae/quizzes" },
  // Leader-side
  { audience: "LEADER",  kind: "page", id: "dashboard",         title: "Dashboard",         href: "/dashboard" },
  { audience: "LEADER",  kind: "page", id: "questions",         title: "Question Bank",     href: "/director/questions" },
  { audience: "LEADER",  kind: "page", id: "products",          title: "Products",          href: "/director/products" },
  { audience: "LEADER",  kind: "page", id: "knowledge-admin",   title: "Knowledge (Admin)", href: "/director/knowledge" },
  { audience: "LEADER",  kind: "page", id: "files",             title: "Files",             href: "/director/files" },
  { audience: "LEADER",  kind: "page", id: "reviews",           title: "Reviews",           href: "/director/reviews" },
  // Admin-only
  { audience: "ADMIN",   kind: "page", id: "analyze", title: "Analyze",       href: "/admin/analyze" },
  { audience: "ADMIN",   kind: "page", id: "reports", title: "Reports",       href: "/admin/reports" },
  { audience: "ADMIN",   kind: "page", id: "users",   title: "Users",         href: "/admin/users" },
  { audience: "ADMIN",   kind: "page", id: "orgs",    title: "Customer Orgs", href: "/admin/orgs" },
];

function pageVisibleToRole(audience: Role, role: string): boolean {
  if (audience === "ANY") return true;
  if (audience === "AE_ONLY") return role === "AE";
  if (audience === "LEADER") return role !== "AE";
  if (audience === "ADMIN") return role === "ORG_ADMIN" || role === "COMPANY_ADMIN";
  return false;
}

export async function GET(req: Request) {
  const ctx = await requireSession();
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ results: [] });

  const isAE = ctx.role === "AE";
  const orgFilter = ctx.role === "ORG_ADMIN" ? {} : { orgId: ctx.effectiveOrgId };

  // Static pages — fuzzy match by title, role-filtered.
  const qLower = q.toLowerCase();
  const pages = STATIC_PAGES
    .filter((p) => pageVisibleToRole(p.audience, ctx.role))
    .filter((p) => p.title.toLowerCase().includes(qLower))
    .map(({ audience: _audience, ...p }) => p as ResultItem);

  // Articles — never expose director-only PERSONALITY repos to AEs, and AEs
  // see APPROVED only. Article URL routes to the AE reader for AEs and the
  // admin reader for leaders.
  const articles = await prisma.knowledgeArticle.findMany({
    where: {
      ...orgFilter,
      title: { contains: q, mode: "insensitive" },
      ...(isAE ? { status: "APPROVED", repository: { kind: { not: "PERSONALITY" } } } : {}),
    },
    select: { id: true, title: true, repository: { select: { name: true } } },
    take: 8,
  });
  const articleItems: ResultItem[] = articles.map((a: any) => ({
    kind: "article",
    id: a.id,
    title: a.title,
    subtitle: `Article · ${a.repository.name}`,
    href: isAE ? `/knowledge/articles/${a.id}` : `/director/knowledge/articles/${a.id}`,
  }));

  // People-pickers (AE / director profiles) — never shown to AEs since the
  // target URLs are leader-only and AEs shouldn't be browsing other people.
  let aeItems: ResultItem[] = [];
  let dirItems: ResultItem[] = [];
  if (!isAE) {
    const aes = await prisma.aeProfile.findMany({
      where: {
        ...orgFilter,
        user: {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        },
      },
      include: { user: { select: { name: true, email: true } }, director: { select: { name: true } } },
      take: 8,
    });
    const directors = await prisma.directorProfile.findMany({
      where: {
        ...orgFilter,
        user: {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        },
      },
      include: { user: { select: { name: true, email: true, role: true } } },
      take: 5,
    });
    aeItems = aes.map((a: any) => ({
      kind: "ae",
      id: a.id,
      title: a.user.name,
      subtitle: `AE${a.director?.name ? ` · reports to ${a.director.name}` : ""}`,
      href: `/director/ae/${a.id}`,
    }));
    dirItems = directors.map((d: any) => ({
      kind: "director",
      id: d.id,
      title: d.user.name,
      subtitle: `Director · ${d.user.email}`,
      href: `/director/director/${d.id}`,
    }));
  }

  // Products — leader-only (the /director/products UI isn't AE-accessible).
  // For AEs, product info lives inside knowledge articles (their search will
  // match those instead).
  let productItems: ResultItem[] = [];
  if (!isAE) {
    const products = await prisma.product.findMany({
      where: {
        ...orgFilter,
        active: true,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { summary: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, summary: true },
      take: 5,
    });
    productItems = products.map((p: any) => ({
      kind: "product",
      id: p.id,
      title: p.name,
      subtitle: `Product${p.summary ? ` · ${p.summary.slice(0, 80)}` : ""}`,
      href: `/director/products`,
    }));
  }

  const results: ResultItem[] = [...pages, ...aeItems, ...dirItems, ...articleItems, ...productItems];

  return NextResponse.json({ results: results.slice(0, 30) });
}
