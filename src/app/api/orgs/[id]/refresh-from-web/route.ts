/**
 * POST /api/orgs/[id]/refresh-from-web
 * Body: { websiteUrl?, fillMissingOnly? }
 *
 * Server-side fetches the org's website (or supplied URL), passes the cleaned text to Grok,
 * and creates Products + Knowledge Articles. Idempotent on slug for products.
 * If fillMissingOnly is true, skips products that already exist (default true).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";
import { analyzeWebsite } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 90;

const Body = z.object({
  websiteUrl: z.string().url().optional(),
  fillMissingOnly: z.boolean().default(true),
});

function htmlToText(html: string): string {
  let txt = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  txt = txt.replace(/<[^>]+>/g, " ");
  txt = txt
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return txt.replace(/\s+/g, " ").trim();
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN");
  if (ctx.role === "COMPANY_ADMIN" && ctx.effectiveOrgId !== params.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgFound = await prisma.org.findUnique({ where: { id: params.id } });
  if (!orgFound) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const org = orgFound;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  const url = (parsed.success ? parsed.data.websiteUrl : undefined) ?? org.websiteUrl;
  const fillMissingOnly = parsed.success ? parsed.data.fillMissingOnly : true;

  if (!url) {
    return NextResponse.json({ error: "No website URL set on org and none provided." }, { status: 400 });
  }

  // Fetch + strip HTML
  let websiteText = "";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "SalesCoachAI-Onboarder/1.0 (+https://portal.benjohnson.ai)" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Fetch failed (${res.status})` }, { status: 400 });
    }
    const ct = res.headers.get("content-type") ?? "";
    const raw = await res.text();
    websiteText = ct.includes("html") ? htmlToText(raw) : raw;
  } catch (e: any) {
    return NextResponse.json({ error: `Could not fetch URL: ${e?.message ?? "unknown"}` }, { status: 400 });
  }

  // Save URL on org if it wasn't there
  if (!org.websiteUrl || org.websiteUrl !== url) {
    await prisma.org.update({ where: { id: org.id }, data: { websiteUrl: url } });
  }

  // What products already exist? (For fillMissingOnly)
  const existing = await prisma.product.findMany({
    where: { orgId: org.id },
    select: { slug: true },
  });
  const existingSlugs = existing.map((p) => p.slug);

  // Call Grok
  const result = await analyzeWebsite({
    orgName: org.name,
    websiteUrl: url,
    websiteText,
    existingProductSlugs: fillMissingOnly ? existingSlugs : [],
  });

  // Persist products (skip duplicates by slug)
  let productsCreated = 0;
  for (const p of result.products ?? []) {
    const slug = slugify(p.slug || p.name);
    if (!slug) continue;
    if (fillMissingOnly && existingSlugs.includes(slug)) continue;
    try {
      await prisma.product.create({
        data: {
          orgId: org.id,
          name: p.name,
          slug,
          summary: p.summary,
          audience: p.audience ?? result.audience.join(", "),
        },
      });
      productsCreated++;
    } catch {
      /* slug collision; skip */
    }
  }

  // Persist articles into the appropriate repo (auto-create repo if missing)
  let articlesCreated = 0;
  const repoCache = new Map<string, string>();
  async function repoFor(kind: string): Promise<string> {
    if (repoCache.has(kind)) return repoCache.get(kind)!;
    const name =
      kind === "PRODUCT" ? "Product Knowledge" :
      kind === "SALES_SKILL" ? "Sales Skills" :
      kind === "PERSONALITY" ? "Personality (Director-Only)" :
      kind === "LEADERSHIP" ? "Leadership" :
      `Library — ${kind}`;
    const repo = await prisma.knowledgeRepository.upsert({
      where: { orgId_name: { orgId: org.id, name } },
      update: {},
      create: { orgId: org.id, kind: kind as any, name, visibility: kind === "PERSONALITY" ? "DIRECTOR_ONLY" : "BOTH" },
    });
    repoCache.set(kind, repo.id);
    return repo.id;
  }

  for (const a of result.articles ?? []) {
    const repoId = await repoFor(a.repositoryKind);
    try {
      await prisma.knowledgeArticle.create({
        data: {
          orgId: org.id,
          repositoryId: repoId,
          title: a.title,
          body: a.body,
          tagsJson: (a.tags ?? []) as any,
          authorUserId: ctx.userId,
          // Auto-approved since admin triggered the import
          status: "APPROVED",
          approvedByUserId: ctx.userId,
          approvedAt: new Date(),
        },
      });
      articlesCreated++;
    } catch {
      /* dupe; skip */
    }
  }

  await prisma.auditLog.create({
    data: {
      orgId: org.id,
      actorUserId: ctx.userId,
      action: "ORG_REFRESHED",
      targetType: "Org",
      targetId: org.id,
      metadata: { url, productsCreated, articlesCreated, fillMissingOnly },
    },
  });

  return NextResponse.json({
    ok: true,
    about: result.about,
    audience: result.audience,
    tone: result.tone,
    productsCreated,
    articlesCreated,
  });
}
