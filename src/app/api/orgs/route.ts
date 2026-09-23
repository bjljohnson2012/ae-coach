import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";

const Body = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, "lowercase-and-dashes-only"),
  brandColor: z.string().optional(),
  brandLogoUrl: z.string().url().optional(),
});

export async function GET() {
  await requireRole("ORG_ADMIN");
  const orgs = await prisma.org.findMany({
    include: { _count: { select: { users: true, aeProfiles: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ orgs });
}

export async function POST(req: Request) {
  const ctx = await requireRole("ORG_ADMIN");
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });

  try {
    const org = await prisma.org.create({ data: parsed.data });
    // Seed an empty CompanyProfile so admin pages work immediately
    await prisma.companyProfile.create({ data: { orgId: org.id } });
    await prisma.auditLog.create({
      data: {
        orgId: org.id,
        actorUserId: ctx.userId,
        action: "USER_CREATED", // we don't have ORG_CREATED enum; use closest
        targetType: "Org",
        targetId: org.id,
        metadata: { name: org.name, slug: org.slug },
      },
    });
    return NextResponse.json({ org });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Slug already taken" }, { status: 409 });
    throw e;
  }
}
