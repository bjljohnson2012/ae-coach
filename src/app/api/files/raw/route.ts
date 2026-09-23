/**
 * GET /api/files/raw?path=... — streams the binary file from disk.
 * Used to render uploaded logos and images publicly within the app.
 * Auth required; only files for the same org can be read.
 *
 * Path normalization:
 *   saveFileBuffer() returns a path like "uploads/<orgId>/<id>-<filename>"
 *   (relative to cwd, with FILES_DIR baked in). Some older records might be
 *   absolute ("/app/uploads/...") or bare-relative ("<orgId>/<filename>").
 *   This route handles all three by resolving against the FS root and only
 *   serving anything inside FILES_DIR.
 */
import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import nodePath from "path";
import { requireSession } from "@/lib/tenancy";

const FILES_DIR = process.env.FILES_DIR ?? "./uploads";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const ctx = await requireSession();
  const { searchParams } = new URL(req.url);
  const rawPath = searchParams.get("path");
  if (!rawPath) return new NextResponse("Missing path", { status: 400 });

  // Resolve to an absolute path. Three formats we accept:
  //   1. Absolute (starts with /)               → use as-is
  //   2. Already prefixed with FILES_DIR        → use as-is, then resolve
  //   3. Bare-relative (<orgId>/<filename>)     → prepend FILES_DIR
  const filesDirAbs = nodePath.resolve(FILES_DIR);
  let candidate: string;
  if (rawPath.startsWith("/")) {
    candidate = rawPath;
  } else if (
    rawPath.startsWith(FILES_DIR) ||
    rawPath.startsWith(FILES_DIR.replace(/^\.\//, "")) ||
    rawPath.startsWith("uploads/")
  ) {
    candidate = nodePath.resolve(rawPath);
  } else {
    candidate = nodePath.resolve(FILES_DIR, rawPath);
  }

  // Hard sandbox: the resolved path MUST live inside FILES_DIR. Prevents
  // path-traversal attacks (../../etc/passwd) since path.resolve normalizes ..
  if (!candidate.startsWith(filesDirAbs)) {
    return new NextResponse("Forbidden path", { status: 403 });
  }

  // Tenant boundary: every uploaded file lives at FILES_DIR/<orgId>/<name>.
  // The path's <orgId> segment must match the requester's effective org.
  // ORG_ADMIN bypasses (super admin can read any org's files for support).
  if (ctx.role !== "ORG_ADMIN" && !candidate.includes(`/${ctx.effectiveOrgId}/`)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const data = await fs.readFile(candidate);
    const ext = candidate.split(".").pop()?.toLowerCase() ?? "";
    const ct = (
      ext === "png" ? "image/png" :
      ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
      ext === "gif" ? "image/gif" :
      ext === "svg" ? "image/svg+xml" :
      ext === "webp" ? "image/webp" :
      ext === "pdf" ? "application/pdf" :
      "application/octet-stream"
    );
    return new NextResponse(data as any, {
      headers: {
        "Content-Type": ct,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    console.warn("[files/raw] read failed:", { rawPath, candidate, err: (err as any)?.message });
    return new NextResponse("Not found", { status: 404 });
  }
}
