import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, assertCanAccessAe } from "@/lib/tenancy";

const Body = z.object({
  aeProfileId: z.string(),
  content: z.string().min(1),
  visibleToAe: z.boolean().default(false),
});

export async function POST(req: Request) {
  const ctx = await requireRole("DIRECTOR", "ORG_ADMIN");
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const access = await assertCanAccessAe(ctx, parsed.data.aeProfileId);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.coachingNote.create({
    data: {
      aeProfileId: parsed.data.aeProfileId,
      directorId: ctx.userId,
      content: parsed.data.content,
      visibleToAe: parsed.data.visibleToAe,
    },
  });
  return NextResponse.json({ ok: true });
}
