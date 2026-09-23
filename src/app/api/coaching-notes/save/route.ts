/**
 * POST /api/coaching-notes/save
 * Body: { aeProfileIds: string[], content: string, visibleToAe?: boolean }
 *
 * Creates one private CoachingNote per AE. Used by the "Save as note" buttons
 * on Compare narrative + per-section Coaching Hints. Default: visibleToAe=false
 * (these are AI-generated leader-only insights, not direct messages to the AE).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, assertCanAccessAe } from "@/lib/tenancy";

const Body = z.object({
  aeProfileIds: z.array(z.string()).min(1).max(20),
  content: z.string().min(2).max(8000),
  visibleToAe: z.boolean().default(false),
});

export async function POST(req: Request) {
  const ctx = await requireSession();
  if (ctx.role === "AE") return NextResponse.json({ error: "Leaders only" }, { status: 403 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  // Verify access to every target
  for (const id of parsed.data.aeProfileIds) {
    const ok = await assertCanAccessAe(ctx, id);
    if (!ok) return NextResponse.json({ error: `Forbidden — AE ${id} is outside your scope` }, { status: 403 });
  }

  let saved = 0;
  for (const id of parsed.data.aeProfileIds) {
    await prisma.coachingNote.create({
      data: {
        aeProfileId: id,
        directorId: ctx.userId,
        content: parsed.data.content,
        visibleToAe: parsed.data.visibleToAe,
      },
    });
    saved++;
  }
  return NextResponse.json({ ok: true, saved });
}
