import Link from "next/link";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { ImpersonateButton } from "./ImpersonateButton";
import { OrgPicker } from "@/components/OrgPicker";
import { prettyRole } from "@/lib/roleLabels";
import { AeRosterClient } from "./AeRosterClient";

const ROLE_BADGE: Record<string, string> = {
  ORG_ADMIN: "badge-active",
  COMPANY_ADMIN: "badge-active",
  VP_SALES: "badge-success",
  DIRECTOR: "badge-success",
  AE: "badge-neutral",
};

const ROLE_ORDER = ["ORG_ADMIN", "COMPANY_ADMIN", "VP_SALES", "DIRECTOR", "AE"];

type OrgPickerItem = {
  id: string;
  name: string;
  brandColor: string | null;
  brandLogoUrl: string | null;
  _count: { users: number; aeProfiles: number };
};
type RosterUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  imageUrl: string | null;
  lastLoginAt: Date | null;
  org: { id: string; name: string; brandColor: string | null };
  aeProfile?: {
    director: { id: string; name: string } | null;
  } | null;
};

export default async function AdminUsersPage({ searchParams }: { searchParams: { orgId?: string } }) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN");

  // ORG_ADMIN can filter by company via ?orgId=. COMPANY_ADMIN is always pinned to their own org.
  const isOrgAdmin = ctx.role === "ORG_ADMIN";
  const filterOrgId = isOrgAdmin ? (searchParams.orgId || "") : ctx.effectiveOrgId;

  // Pull every ACTIVE customer org that has users but NO super admin.
  const allOrgs: OrgPickerItem[] = isOrgAdmin
    ? ((await prisma.org.findMany({
        where: {
          status: "ACTIVE" as any,
          users: {
            some: {},
            none: { role: "ORG_ADMIN" },
          },
        },
        select: {
          id: true,
          name: true,
          brandColor: true,
          brandLogoUrl: true,
          _count: { select: { users: true, aeProfiles: true } },
        },
        orderBy: { name: "asc" },
      })) as OrgPickerItem[])
    : [];

  // If a company is selected, scope to that org. Otherwise show all (ORG_ADMIN only).
  const where = filterOrgId ? { orgId: filterOrgId } : {};
  const users = (await prisma.user.findMany({
    where,
    include: {
      org: { select: { id: true, name: true, brandColor: true } },
      // Pull AE's current director so the bulk-move table can show "currently → Alex"
      aeProfile: {
        select: {
          director: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  })) as RosterUser[];

  // Fetch all directors in scope for the bulk-move modal's picker.
  const directors = (await prisma.user.findMany({
    where: {
      role: "DIRECTOR",
      ...(filterOrgId ? { orgId: filterOrgId } : {}),
    },
    select: {
      id: true, name: true, email: true, orgId: true,
      org: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  })).map((d: any) => ({
    id: d.id,
    name: d.name,
    email: d.email,
    orgId: d.orgId,
    orgName: d.org?.name,
  }));

  const byRole: Record<string, RosterUser[]> = {};
  for (const u of users) {
    (byRole[u.role] ||= []).push(u);
  }

  const selectedOrgName = filterOrgId
    ? (await prisma.org.findUnique({ where: { id: filterOrgId }, select: { name: true } }))?.name ?? "Unknown"
    : null;

  return (
    <div className="page">
      <header className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <div className="eyebrow mb-2">
            {isOrgAdmin ? (selectedOrgName ? selectedOrgName : "All customer orgs") : "Company users"}
          </div>
          <h1 className="h-page">Users</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {users.length} {users.length === 1 ? "person" : "people"}
            {isOrgAdmin && !selectedOrgName ? " across all companies" : ""}
            {selectedOrgName ? ` in ${selectedOrgName}` : ""}.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={filterOrgId ? `/admin/users/new?orgId=${filterOrgId}` : "/admin/users/new"}
            className="btn-primary"
          >
            + Invite{selectedOrgName ? ` to ${selectedOrgName}` : " new user"}
          </Link>
        </div>
      </header>

      {/* Company picker — ORG_ADMIN only. Searchable dropdown so it scales to dozens of orgs. */}
      {isOrgAdmin && allOrgs.length > 0 && (
        <section className="mb-6">
          <div className="eyebrow mb-2">Filter by company</div>
          <OrgPicker
            orgs={allOrgs.map((o) => ({
              id: o.id,
              name: o.name,
              brandColor: o.brandColor,
              brandLogoUrl: o.brandLogoUrl,
              count: o._count.users,
            }))}
            selectedValue={filterOrgId}
            paramKey="orgId"
            routeBase="/admin/users"
            allLabel="All companies"
            totalCount={allOrgs.reduce((s, o) => s + o._count.users, 0)}
          />
        </section>
      )}

      <div className="space-y-5">
        {ROLE_ORDER.map((role) => {
          const list = byRole[role] ?? [];
          if (list.length === 0) return null;

          // AE role gets the bulk-selectable client component (checkboxes +
          // "Move to director" toolbar). Other roles render inline as before.
          if (role === "AE") {
            return (
              <section key={role} className="card overflow-hidden">
                <header className="px-5 py-3 border-b border-ink-softLine flex items-center justify-between bg-surface-soft">
                  <div className="flex items-center gap-2">
                    <span className={ROLE_BADGE[role]}>{prettyRole(role)}</span>
                    <span className="meta">{list.length}</span>
                  </div>
                  <span className="meta text-xs">Tip: select multiple to bulk-move</span>
                </header>
                <AeRosterClient
                  isOrgAdmin={isOrgAdmin}
                  directors={directors}
                  aes={list.map((u) => ({
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    orgId: u.org.id,
                    orgName: isOrgAdmin ? u.org.name : undefined,
                    status: u.status,
                    imageUrl: u.imageUrl,
                    lastLoginAt: u.lastLoginAt,
                    currentDirectorName: u.aeProfile?.director?.name ?? null,
                  }))}
                />
              </section>
            );
          }

          return (
            <section key={role} className="card overflow-hidden">
              <header className="px-5 py-3 border-b border-ink-softLine flex items-center justify-between bg-surface-soft">
                <div className="flex items-center gap-2">
                  <span className={ROLE_BADGE[role] ?? "badge-neutral"}>{prettyRole(role)}</span>
                  <span className="meta">{list.length}</span>
                </div>
              </header>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th className="px-5 py-2 font-semibold">Name</th>
                    <th className="px-5 py-2 font-semibold">Email</th>
                    {isOrgAdmin && <th className="px-5 py-2 font-semibold">Company</th>}
                    <th className="px-5 py-2 font-semibold">Status</th>
                    <th className="px-5 py-2 font-semibold">Last login</th>
                    <th className="px-5 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((u) => (
                    <tr key={u.id} className="border-t border-ink-softLine hover:bg-brand-indigo/5">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          {u.imageUrl ? (
                            <img src={u.imageUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-indigo to-brand-orange flex items-center justify-center text-white text-xs font-semibold" aria-hidden="true">
                              {u.name.charAt(0)}
                            </div>
                          )}
                          <span className="font-medium">{u.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-ink-slate font-mono text-xs">{u.email}</td>
                      {isOrgAdmin && (
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            <span
                              className="w-2.5 h-2.5 rounded-sm shrink-0"
                              style={{ background: u.org.brandColor || "#1F3C88" }}
                              aria-hidden="true"
                            />
                            {u.org.name}
                          </span>
                        </td>
                      )}
                      <td className="px-5 py-3">
                        {u.status === "ACTIVE" ? <span className="badge-success">Active</span>
                          : u.status === "PENDING" ? <span className="badge-warning">Pending</span>
                          : <span className="badge-neutral">Inactive</span>}
                      </td>
                      <td className="px-5 py-3 text-ink-muted text-xs">
                        {u.lastLoginAt ? u.lastLoginAt.toLocaleDateString() : "Never"}
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <Link href={`/admin/users/${u.id}/edit`} className="link text-xs">Edit</Link>
                        {isOrgAdmin && u.role !== "ORG_ADMIN" && (
                          <ImpersonateButton userId={u.id} userName={u.name} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}
      </div>
    </div>
  );
}
