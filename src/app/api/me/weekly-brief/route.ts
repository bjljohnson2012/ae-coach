/**
 * PATCH /api/me/weekly-brief
 * Body: { subscribed: boolean }
 *
 * Toggle the weekly improvement-brief subscription on the current user.
 * Sender (cron) ships in v3.34.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenancy";

const Body = z.object({ subscribed: z.boolean() });

export async function PATCH(req: Request) {
  const ctx = await requireSession();
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  await prisma.user.update({
    where: { id: ctx.userId },
    data: { weeklyBriefSubscribed: parsed.data.subscribed } as any,
  });
  return NextResponse.json({ ok: true });
}
