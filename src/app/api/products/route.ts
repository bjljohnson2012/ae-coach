import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";

export async function GET() {
  const ctx = await requireRole("DIRECTOR", "ORG_ADMIN", "AE");
  const products = await prisma.product.findMany({
    where: { orgId: ctx.effectiveOrgId, active: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ products });
}

const Body = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "lowercase-and-dashes-only").optional(),
  summary: z.string().optional(),
  audience: z.string().optional(),
});

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export async function POST(req: Request) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  // Auto-derive slug, ensuring uniqueness within the org
  let baseSlug = parsed.data.slug || slugify(parsed.data.name);
  if (!baseSlug) return NextResponse.json({ error: "Couldn't derive slug from name" }, { status: 400 });

  let slug = baseSlug;
  let suffix = 1;
  while (await prisma.product.findUnique({ where: { orgId_slug: { orgId: ctx.effectiveOrgId, slug } } })) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  const product = await prisma.product.create({
    data: {
      name: parsed.data.name,
      slug,
      summary: parsed.data.summary,
      audience: parsed.data.audience,
      orgId: ctx.effectiveOrgId,
    },
  });
  return NextResponse.json({ product });
}
