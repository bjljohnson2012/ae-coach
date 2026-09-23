/**
 * POST /api/files/classify
 * Body: { filename, mimeType, textPreview }
 * Returns Grok's suggested kind/AE/intent/visibility for director to confirm.
 * Does NOT persist anything; just a suggestion.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";
import { classifyFile } from "@/lib/ai";

const Body = z.object({
  filename: z.string(),
  mimeType: z.string(),
  textPreview: z.string().max(8000),
});

export async function POST(req: Request) {
  const ctx = await requireRole("DIRECTOR", "ORG_ADMIN");
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  // Pull director's directable AEs as candidates
  const aes = await prisma.aeProfile.findMany({
    where: ctx.role === "ORG_ADMIN" ? { orgId: ctx.effectiveOrgId } : { directorId: ctx.userId },
    include: { user: { select: { name: true } } },
  });

  const suggestion = await classifyFile({
    filename: parsed.data.filename,
    mimeType: parsed.data.mimeType,
    textPreview: parsed.data.textPreview,
    candidateAes: aes.map((a) => ({ id: a.id, name: a.user.name })),
  });

  return NextResponse.json({ suggestion });
}
