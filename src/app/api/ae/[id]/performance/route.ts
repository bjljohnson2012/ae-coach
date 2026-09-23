/**
 * GET    /api/ae/[id]/performance        — list quarterly perf rows for this AE
 * POST   /api/ae/[id]/performance        — upsert one row { year, quarter, quotaCents?, attainedCents?, newLogos?, meetingsHeld?, notes? }
 * DELETE /api/ae/[id]/performance        — body { year, quarter } removes that quarter
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, assertCanAccessAe } from "@/lib/tenancy";

const Upsert = z.object({
  year: z.number().int().min(2000).max(2100),
  quarter: z.number().int().min(1).max(4),
  quotaCents: z.number().int().nullable().optional(),
  attainedCents: z.number().int().nullable().optional(),
  newLogos: z.number().int().nullable().optional(),
  meetingsHeld: z.number().int().nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN", "AE");
  // Allow AE to view their own
  if (ctx.role === "AE") {
    const ae = await prisma.aeProfile.findUnique({ where: { id: params.id }, select: { userId: true } });
    if (ae?.userId !== ctx.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else {
    const access = await assertCanAccessAe(ctx, params.id);
    if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await prisma.quarterlyPerformance.findMany({
    where: { aeProfileId: params.id },
    orderBy: [{ year: "desc" }, { quarter: "desc" }],
  });
  return NextResponse.json({ rows });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const access = await assertCanAccessAe(ctx, params.id);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = Upsert.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });

  const data = parsed.data;
  const row = await prisma.quarterlyPerformance.upsert({
    where: { aeProfileId_year_quarter: { aeProfileId: params.id, year: data.year, quarter: data.quarter } },
    update: {
      quotaCents: data.quotaCents ?? null,
      attainedCents: data.attainedCents ?? null,
      newLogos: data.newLogos ?? null,
      meetingsHeld: data.meetingsHeld ?? null,
      notes: data.notes ?? null,
      recordedByUserId: ctx.userId,
    },
    create: {
      aeProfileId: params.id,
      year: data.year,
      quarter: data.quarter,
      quotaCents: data.quotaCents ?? null,
      attainedCents: data.attainedCents ?? null,
      newLogos: data.newLogos ?? null,
      meetingsHeld: data.meetingsHeld ?? null,
      notes: data.notes ?? null,
      recordedByUserId: ctx.userId,
    },
  });
  return NextResponse.json({ row });
}

const DeleteBody = z.object({
  year: z.number().int(),
  quarter: z.number().int().min(1).max(4),
});

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const access = await assertCanAccessAe(ctx, params.id);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = DeleteBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  await prisma.quarterlyPerformance.delete({
    where: { aeProfileId_year_quarter: { aeProfileId: params.id, year: parsed.data.year, quarter: parsed.data.quarter } },
  }).catch(() => null);
  return NextResponse.json({ ok: true });
}
