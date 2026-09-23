/**
 * GET /api/questions/check-duplicate?text=...&category=...&orgId=...
 *
 * Returns either { match: null } or { match: DuplicateMatch }. Used for
 * inline UI warnings while the author is typing — debounced on the client.
 *
 * orgId override: ORG_ADMIN authoring on behalf of a specific customer org
 * passes their target orgId. Everyone else uses their own effectiveOrgId.
 */
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/tenancy";
import { findDuplicateQuestion } from "@/lib/questionDedup";

export async function GET(req: Request) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const { searchParams } = new URL(req.url);
  const text = searchParams.get("text") || "";
  const category = searchParams.get("category") || "";
  if (!text || !category) return NextResponse.json({ match: null });

  // ORG_ADMIN can scope to a different org via ?orgId=
  const requestedOrgId = searchParams.get("orgId");
  const targetOrgId = ctx.role === "ORG_ADMIN" && requestedOrgId
    ? requestedOrgId
    : ctx.effectiveOrgId;

  const match = await findDuplicateQuestion({ text, category, targetOrgId });
  return NextResponse.json({ match });
}
