/**
 * GET /api/analyze/drill?kind=personality&type=ENNEAGRAM&value=9
 * GET /api/analyze/drill?kind=skill&category=DISCOVERY&min=0&max=40
 *
 * Returns the same data as /admin/analyze/drill but as JSON, for in-page drawer
 * popovers. Tenant-scoped to the caller.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";

export async function GET(req: Request) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN", "VP_SALES", "DIRECTOR");
  const orgFilter = ctx.role === "ORG_ADMIN" ? {} : { orgId: ctx.effectiveOrgId };

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? "personality";
  const min = Number(url.searchParams.get("min") ?? 0);
  const max = Number(url.searchParams.get("max") ?? 100);

  let title = "AEs";
  let subtitle = "";
  let viewAllHref = "/admin/analyze";
  let aes: any[] = [];
  let scoreCategory: string | null = null;

  if (kind === "personality") {
    const type = (url.searchParams.get("type") ?? "ENNEAGRAM").toUpperCase();
    const value = url.searchParams.get("value") ?? "";
    title = `${type} = ${value}`;
    subtitle = `AEs identified as ${type} ${value}`;
    viewAllHref = `/admin/analyze/drill?kind=personality&type=${type}&value=${encodeURIComponent(value)}`;

    const field = type === "ENNEAGRAM" ? "enneagramType" : type === "DISC" ? "discProfile" : type === "MBTI" ? "mbtiType" : "enneagramType";

    aes = await prisma.aeProfile.findMany({
      where: { ...orgFilter, [field]: value },
      include: {
        user: { select: { id: true, name: true, email: true, imageUrl: true } },
        director: { select: { name: true } },
      },
      orderBy: { user: { name: "asc" } },
      take: 100,
    });
  } else if (kind === "skill") {
    const category = (url.searchParams.get("category") ?? "DISCOVERY").toUpperCase();
    scoreCategory = category;
    title = `${category.replace(/_/g, " ")} score ${min}–${max}`;
    subtitle = `AEs whose ${category.toLowerCase().replace(/_/g, " ")} score falls in this band`;
    viewAllHref = `/admin/analyze/drill?kind=skill&category=${category}&min=${min}&max=${max}`;

    aes = await prisma.aeProfile.findMany({
      where: {
        ...orgFilter,
        skillScores: { some: { category: category as any, score: { gte: min, lte: max } } },
      },
      include: {
        user: { select: { id: true, name: true, email: true, imageUrl: true } },
        director: { select: { name: true } },
        skillScores: { select: { category: true, score: true } },
      },
      orderBy: { user: { name: "asc" } },
      take: 100,
    });
  }

  const rows = aes.map((ae: any) => ({
    id: ae.id,
    name: ae.user.name,
    email: ae.user.email,
    imageUrl: ae.user.imageUrl,
    directorName: ae.director?.name ?? null,
    score: scoreCategory
      ? ae.skillScores?.find((s: any) => s.category === scoreCategory)?.score ?? null
      : null,
  }));

  return NextResponse.json({ title, subtitle, rows, viewAllHref });
}
