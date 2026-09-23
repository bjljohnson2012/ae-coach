/**
 * GET /api/users/manageable
 * Returns users the caller can assign tasks to (self + lower-or-equal permission).
 */
import { NextResponse } from "next/server";
import { requireSession, getManageableUsers } from "@/lib/tenancy";

export async function GET() {
  const ctx = await requireSession();
  const users = await getManageableUsers(ctx);
  return NextResponse.json({ users, selfId: ctx.userId });
}
