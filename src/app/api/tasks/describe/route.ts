import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, assertCanAccessAe } from "@/lib/tenancy";
import { generateTaskDescription } from "@/lib/ai";

const Body = z.object({
  title: z.string().min(2),
  aeProfileId: z.string(),
});

export async function POST(req: Request) {
  const ctx = await requireSession();
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const access = await assertCanAccessAe(ctx, parsed.data.aeProfileId);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ae = await prisma.aeProfile.findUnique({
    where: { id: parsed.data.aeProfileId },
    include: { user: true, skillScores: true },
  });
  if (!ae) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const description = await generateTaskDescription({
    title: parsed.data.title,
    aeName: ae.user.name,
    strengths: (ae.strengthsJson as string[]) ?? [],
    weaknesses: (ae.weaknessesJson as string[]) ?? [],
    skillScores: ae.skillScores.map((s) => ({ category: s.category, score: s.score })),
  });
  return NextResponse.json({ description });
}
