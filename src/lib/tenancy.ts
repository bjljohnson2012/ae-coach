/**
 * Tenancy + role hierarchy guards.
 *
 * Hierarchy:  ORG_ADMIN > COMPANY_ADMIN > VP_SALES > DIRECTOR > AE
 *
 * Every server-side query touching multi-tenant tables MUST go through here.
 */
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "./auth";
import { prisma } from "./prisma";

export type SessionRole = "ORG_ADMIN" | "COMPANY_ADMIN" | "VP_SALES" | "DIRECTOR" | "AE";

export interface SessionContext {
  userId: string;
  email: string;
  name: string;
  role: SessionRole;
  orgId: string;
  effectiveOrgId: string;
}

export async function getSessionOrNull(): Promise<SessionContext | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const u = session.user as any;

  // Impersonation: ORG_ADMIN only. Cookie-driven swap of context.
  if (u.role === "ORG_ADMIN") {
    try {
      const { cookies } = await import("next/headers");
      const cookieStore = cookies();
      const targetId = cookieStore.get("impersonate_uid")?.value;
      if (targetId) {
        const target = await prisma.user.findUnique({ where: { id: targetId } });
        if (target && target.role !== "ORG_ADMIN") {
          return {
            userId: target.id,
            email: target.email,
            name: target.name,
            role: target.role as SessionRole,
            orgId: target.orgId,
            effectiveOrgId: target.orgId,
          };
        }
      }
    } catch {
      // ignore — fall through to real session
    }
  }

  return {
    userId: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    orgId: u.orgId,
    effectiveOrgId: u.orgId,
  };
}

/**
 * Returns true (and the original ORG_ADMIN context) if the current request is impersonating.
 * Used to render the "exit impersonation" banner.
 */
export async function getImpersonationStatus(): Promise<{ isImpersonating: boolean; targetName?: string; targetRole?: string } | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const u = session.user as any;
  if (u.role !== "ORG_ADMIN") return { isImpersonating: false };
  try {
    const { cookies } = await import("next/headers");
    const targetId = cookies().get("impersonate_uid")?.value;
    if (!targetId) return { isImpersonating: false };
    const target = await prisma.user.findUnique({ where: { id: targetId } });
    if (!target) return { isImpersonating: false };
    return { isImpersonating: true, targetName: target.name, targetRole: target.role };
  } catch {
    return { isImpersonating: false };
  }
}

export async function requireSession(): Promise<SessionContext> {
  const ctx = await getSessionOrNull();
  if (!ctx) redirect("/login");
  return ctx;
}

export async function requireRole(...allowed: SessionRole[]): Promise<SessionContext> {
  const ctx = await requireSession();
  if (!allowed.includes(ctx.role)) redirect("/dashboard");
  return ctx;
}

/**
 * Returns the org_ids this user has access to.
 */
export async function getAccessibleOrgIds(ctx: SessionContext): Promise<string[]> {
  if (ctx.role === "ORG_ADMIN") {
    const orgs = await prisma.org.findMany({ select: { id: true } });
    return orgs.map((o) => o.id);
  }
  if (ctx.role === "DIRECTOR" || ctx.role === "VP_SALES") {
    const assignments = await prisma.directorAssignment.findMany({
      where: { directorId: ctx.userId },
      select: { orgId: true },
    });
    return Array.from(new Set([ctx.orgId, ...assignments.map((a) => a.orgId)]));
  }
  return [ctx.orgId];
}

/**
 * Returns AeProfile IDs this user can read/edit.
 * Centralized so every list/query inherits the same rules.
 */
export async function getAccessibleAeIds(ctx: SessionContext): Promise<string[]> {
  if (ctx.role === "ORG_ADMIN") {
    const all = await prisma.aeProfile.findMany({ select: { id: true } });
    return all.map((a) => a.id);
  }
  if (ctx.role === "COMPANY_ADMIN") {
    const own = await prisma.aeProfile.findMany({
      where: { orgId: ctx.effectiveOrgId },
      select: { id: true },
    });
    return own.map((a) => a.id);
  }
  if (ctx.role === "VP_SALES") {
    // AEs of directors who report to me
    const directors = await prisma.user.findMany({
      where: { vpId: ctx.userId, role: "DIRECTOR" },
      select: { id: true },
    });
    const dIds = directors.map((d) => d.id);
    if (dIds.length === 0) return [];
    const aes = await prisma.aeProfile.findMany({
      where: { directorId: { in: dIds } },
      select: { id: true },
    });
    return aes.map((a) => a.id);
  }
  if (ctx.role === "DIRECTOR") {
    const aes = await prisma.aeProfile.findMany({
      where: { directorId: ctx.userId },
      select: { id: true },
    });
    return aes.map((a) => a.id);
  }
  // AE
  const own = await prisma.aeProfile.findUnique({
    where: { userId: ctx.userId },
    select: { id: true },
  });
  return own ? [own.id] : [];
}

export async function assertCanAccessAe(ctx: SessionContext, aeProfileId: string) {
  const ae = await prisma.aeProfile.findUnique({
    where: { id: aeProfileId },
    select: { id: true, orgId: true, userId: true, directorId: true },
  });
  if (!ae) return null;

  if (ctx.role === "ORG_ADMIN") return ae;
  if (ctx.role === "COMPANY_ADMIN") return ae.orgId === ctx.effectiveOrgId ? ae : null;
  if (ctx.role === "AE") return ae.userId === ctx.userId ? ae : null;

  if (ctx.role === "VP_SALES") {
    if (!ae.directorId) return null;
    const director = await prisma.user.findUnique({
      where: { id: ae.directorId },
      select: { vpId: true },
    });
    return director?.vpId === ctx.userId ? ae : null;
  }

  // DIRECTOR
  if (ae.directorId === ctx.userId) return ae;
  const accessible = await getAccessibleOrgIds(ctx);
  return accessible.includes(ae.orgId) ? ae : null;
}

/**
 * Roles that have leadership-style dashboards (vs. AE personal dashboard).
 */
export function isLeader(role: SessionRole): boolean {
  return role === "ORG_ADMIN" || role === "COMPANY_ADMIN" || role === "VP_SALES" || role === "DIRECTOR";
}

/**
 * Permission rank — higher number = more authority.
 * Used to determine who you can assign tasks to (anyone at your level or below).
 */
const ROLE_RANK: Record<string, number> = {
  ORG_ADMIN: 5,
  COMPANY_ADMIN: 4,
  VP_SALES: 3,
  DIRECTOR: 2,
  AE: 1,
};

/**
 * Returns the set of users the current session can manage / assign tasks to.
 * Includes themselves. Excludes anyone with a HIGHER rank.
 *
 * Tenant boundary: ORG_ADMIN sees all orgs; everyone else sees their own org only.
 *
 * Reporting boundary:
 *   - VP sees: self + directors who report to them + AEs under those directors
 *   - DIRECTOR sees: self + AEs they manage
 */
export async function getManageableUsers(ctx: SessionContext): Promise<Array<{
  id: string; name: string; email: string; role: string; orgId: string;
}>> {
  const myRank = ROLE_RANK[ctx.role] ?? 0;
  const orgScope = ctx.role === "ORG_ADMIN" ? {} : { orgId: ctx.effectiveOrgId };

  if (ctx.role === "ORG_ADMIN" || ctx.role === "COMPANY_ADMIN") {
    // Everyone at or below their rank in the visible org(s)
    const users = await prisma.user.findMany({
      where: {
        ...orgScope,
        role: {
          in: Object.entries(ROLE_RANK)
            .filter(([, r]) => r <= myRank)
            .map(([role]) => role as any),
        },
      },
      select: { id: true, name: true, email: true, role: true, orgId: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });
    return users;
  }

  if (ctx.role === "VP_SALES") {
    // self + directors reporting to me + AEs under those directors
    const directors = await prisma.user.findMany({
      where: { vpId: ctx.userId, role: "DIRECTOR" },
      select: { id: true, name: true, email: true, role: true, orgId: true },
    });
    const directorIds = directors.map((d) => d.id);
    const aes = await prisma.user.findMany({
      where: {
        role: "AE",
        aeProfile: { directorId: { in: directorIds } },
      },
      select: { id: true, name: true, email: true, role: true, orgId: true },
    });
    const me = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { id: true, name: true, email: true, role: true, orgId: true },
    });
    return [me!, ...directors, ...aes].filter(Boolean);
  }

  if (ctx.role === "DIRECTOR") {
    // self + AEs reporting to me
    const aeProfiles = await prisma.aeProfile.findMany({
      where: { directorId: ctx.userId },
      select: { user: { select: { id: true, name: true, email: true, role: true, orgId: true } } },
    });
    const me = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { id: true, name: true, email: true, role: true, orgId: true },
    });
    return [me!, ...aeProfiles.map((a) => a.user)].filter(Boolean);
  }

  // AE — only themselves
  const me = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { id: true, name: true, email: true, role: true, orgId: true },
  });
  return me ? [me] : [];
}

/**
 * Can the current session access this director's profile?
 *  - ORG_ADMIN: any
 *  - COMPANY_ADMIN: same org
 *  - VP_SALES: only directors who report to them (vpId = ctx.userId)
 *  - DIRECTOR: only their own profile
 *  - AE: never
 */
export async function assertCanAccessDirector(ctx: SessionContext, directorProfileId: string) {
  const dp = await prisma.directorProfile.findUnique({
    where: { id: directorProfileId },
    select: { id: true, orgId: true, userId: true, user: { select: { id: true, vpId: true, role: true } } },
  });
  if (!dp) return null;

  if (ctx.role === "ORG_ADMIN") return dp;
  if (ctx.role === "COMPANY_ADMIN") return dp.orgId === ctx.effectiveOrgId ? dp : null;
  if (ctx.role === "VP_SALES") return dp.user.vpId === ctx.userId ? dp : null;
  if (ctx.role === "DIRECTOR") return dp.userId === ctx.userId ? dp : null;
  return null;
}
