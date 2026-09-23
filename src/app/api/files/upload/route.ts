/**
 * POST /api/files/upload  (multipart/form-data)
 * Fields:
 *   file        - the binary file
 *   aeProfileId - optional AE id to attach
 *   kind        - optional override (else inferred via AI classify)
 *   updateIntent - optional (else AI suggests)
 *   visibility   - optional
 *
 * If kind/intent omitted, the response includes an AI suggestion the client confirms via /api/files.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";
import { saveFileBuffer, extractText } from "@/lib/files";
import { classifyFile } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB — coaching artifacts cap

export async function POST(req: Request) {
  // AEs can upload their own avatars + small profile assets. AI-classify and
  // candidate-AE search are skipped automatically when the role is AE.
  const ctx = await requireRole("AE", "DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File exceeds 25 MB limit` }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = file.name;
  const mimeType = file.type || "application/octet-stream";

  // Extract text (best-effort) for AI classify and downstream cross-ref
  let textPreview = "";
  try {
    textPreview = await extractText(filename, mimeType, buffer);
  } catch (err) {
    console.warn("Text extraction failed:", filename, err);
  }

  // Save to disk first
  const { storagePath, sizeBytes } = await saveFileBuffer(ctx.effectiveOrgId, filename, buffer);

  // Auto-classify via Grok if AE candidates exist
  let aiSuggestion: any = null;
  if (textPreview.length > 50) {
    const aes = await prisma.aeProfile.findMany({
      where: ctx.role === "ORG_ADMIN" || ctx.role === "COMPANY_ADMIN"
        ? { orgId: ctx.effectiveOrgId }
        : ctx.role === "VP_SALES"
          ? {
              director: {
                vpId: ctx.userId,
              },
            }
          : { directorId: ctx.userId },
      include: { user: { select: { name: true } } },
      take: 50,
    });
    if (aes.length > 0) {
      try {
        aiSuggestion = await classifyFile({
          filename,
          mimeType,
          textPreview: textPreview.slice(0, 8000),
          candidateAes: aes.map((a) => ({ id: a.id, name: a.user.name })),
        });
      } catch (err) {
        console.warn("AI classify failed:", err);
      }
    }
  }

  return NextResponse.json({
    upload: {
      filename,
      mimeType,
      sizeBytes,
      storagePath,
      textPreview: textPreview.slice(0, 4000), // for downstream cross-ref if needed
    },
    suggestion: aiSuggestion,
  });
}
