/**
 * POST /api/director-review/new
 * Body: { aeProfileId, kind: "MONTHLY" | "AD_HOC", title?, monthOf? }
 * Creates a new DirectorReview row (PENDING). For ad-hoc, monthOf = today (rounded to first of month).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, assertCanAccessAe } from "@/lib/tenancy";

const Body = z.object({
  aeProfileId: z.string(),
  kind: z.enum(["MONTHLY", "AD_HOC"]).default("AD_HOC"),
  title: z.string().optional(),
  monthOf: z.string().datetime().optional(),
});

export async function POST(req: Request) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const access = await assertCanAccessAe(ctx, parsed.data.aeProfileId);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // For ad-hoc reviews, allow any date (we just use today). For monthly, snap to first of month.
  let monthOf = parsed.data.monthOf ? new Date(parsed.data.monthOf) : new Date();
  if (parsed.data.kind === "MONTHLY") {
    monthOf.setDate(1);
    monthOf.setHours(0, 0, 0, 0);
  }

  // Avoid duplicate Monthly for same month; for AD_HOC, allow multiple by adjusting date slightly
  let directorId = ctx.role === "DIRECTOR" ? ctx.userId : access.directorId ?? ctx.userId;

  try {
    const review = await prisma.directorReview.create({
      data: {
        directorId,
        aeProfileId: parsed.data.aeProfileId,
        monthOf: parsed.data.kind === "AD_HOC"
          ? new Date(Date.now() + Math.random() * 1000) // unique-per-second to avoid unique conflict
          : monthOf,
        status: "PENDING",
        dueAt: new Date(monthOf.getTime() + 30 * 24 * 3600 * 1000),
        summary: parsed.data.title ?? null,
      },
    });
    return NextResponse.json({ review });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Review already exists for this period." }, { status: 409 });
    throw e;
  }
}
