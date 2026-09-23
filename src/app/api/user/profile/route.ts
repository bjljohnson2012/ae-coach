import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenancy";

// imageUrl can be a relative path (/api/files/raw?path=...) or an absolute URL.
// Reject only obvious garbage; relative paths are valid.
const imageUrlSchema = z
  .string()
  .max(2048)
  .refine(
    (v) => v === "" || v.startsWith("/") || /^https?:\/\//.test(v) || v.startsWith("data:image/"),
    "Must be a relative path (/...) or absolute URL"
  );

const Body = z.object({
  name: z.string().min(1).max(120).optional(),
  imageUrl: imageUrlSchema.nullable().optional(),
});

export async function PATCH(req: Request) {
  const ctx = await requireSession();
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const updated = await prisma.user.update({
    where: { id: ctx.userId },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.imageUrl !== undefined && { imageUrl: parsed.data.imageUrl }),
    },
    select: { id: true, name: true, imageUrl: true },
  });
  return NextResponse.json({ user: updated });
}
