import Link from "next/link";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { InviteUserForm } from "./InviteUserForm";

export default async function NewUserPage({
  searchParams,
}: {
  searchParams: { orgId?: string };
}) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN");

  const orgs = ctx.role === "ORG_ADMIN"
    ? await prisma.org.findMany({
        // Only ACTIVE customer orgs get listed for invitation. Inactive/offboarded
        // shouldn't accept new users — and the platform org isn't a customer org.
        // Bulletproof: also exclude any org that has a Super Admin inside it.
        where: {
          status: "ACTIVE" as any,
          users: {
            some: {},
            none: { role: "ORG_ADMIN" },
          },
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [{ id: ctx.effectiveOrgId, name: "(your org)" }];

  // ORG_ADMIN may arrive from a customer org's edit page with ?orgId=...
  const presetOrgId = ctx.role === "ORG_ADMIN" ? searchParams.orgId : undefined;

  const vps = await prisma.user.findMany({
    where: ctx.role === "ORG_ADMIN" ? { role: "VP_SALES" } : { role: "VP_SALES", orgId: ctx.effectiveOrgId },
    select: { id: true, name: true, orgId: true },
  });
  const directors = await prisma.user.findMany({
    where: ctx.role === "ORG_ADMIN" ? { role: "DIRECTOR" } : { role: "DIRECTOR", orgId: ctx.effectiveOrgId },
    select: { id: true, name: true, orgId: true },
  });

  return (
    <div className="page max-w-2xl">
      <Link href="/admin/users" className="link text-sm">← Users</Link>
      <h1 className="h-page mt-2">Invite New User</h1>
      <p className="text-sm text-ink-muted mt-1 mb-6">
        We'll generate a one-time link they can use to set their password.
      </p>
      <InviteUserForm
        canPickOrg={ctx.role === "ORG_ADMIN"}
        orgs={orgs}
        vps={vps}
        directors={directors}
        presetOrgId={presetOrgId}
      />
    </div>
  );
}
