import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";
import { suggestBrandPalettes } from "@/lib/ai";

const Body = z.object({
  description: z.string().optional(),
  websiteUrl: z.string().url().optional(),
  preferredVibe: z.enum(["professional", "energetic", "minimal", "bold", "warm"]).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN");
  if (ctx.role === "COMPANY_ADMIN" && ctx.effectiveOrgId !== params.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const org = await prisma.org.findUnique({ where: { id: params.id } });
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  const input = parsed.success ? parsed.data : {};

  const palettes = await suggestBrandPalettes({
    brandName: org.name,
    description: input.description,
    websiteUrl: input.websiteUrl ?? org.websiteUrl ?? undefined,
    preferredVibe: input.preferredVibe,
  });
  return NextResponse.json({ palettes });
}
