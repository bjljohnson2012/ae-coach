import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { OrgSettingsLayout } from "./OrgSettingsLayout";
import { OrgLifecyclePanel } from "./OrgLifecyclePanel";
import { prettyRole } from "@/lib/roleLabels";

const ROLE_BADGE: Record<string, string> = {
  ORG_ADMIN: "badge-active",
  COMPANY_ADMIN: "badge-active",
  VP_SALES: "badge-success",
  DIRECTOR: "badge-success",
  AE: "badge-neutral",
};

const ROLE_ORDER = ["ORG_ADMIN", "COMPANY_ADMIN", "VP_SALES", "DIRECTOR", "AE"];

export default async function EditOrgPage({ params }: { params: { id: string } }) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN");
  if (ctx.role === "COMPANY_ADMIN" && ctx.effectiveOrgId !== params.id) notFound();

  const org = await prisma.org.findUnique({
    where: { id: params.id },
    include: { companyProfile: true, users: { select: { role: true }, where: { role: "ORG_ADMIN" } } },
  });
  if (!org) notFound();

  // Detect platform context (Ben's home org)
  const isPlatform = (org.users ?? []).some((u: any) => u.role === "ORG_ADMIN");

  // Pull every user in this org so the admin can see who lives where without
  // navigating to the global Users page. Grouped by role for scanability.
  type OrgUser = {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    lastLoginAt: Date | null;
    imageUrl: string | null;
  };
  const allUsers = (await prisma.user.findMany({
    where: { orgId: params.id },
    select: { id: true, name: true, email: true, role: true, status: true, lastLoginAt: true, imageUrl: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  })) as OrgUser[];
  const usersByRole: Record<string, OrgUser[]> = {};
  for (const u of allUsers) {
    (usersByRole[u.role] ||= []).push(u);
  }
  const aeCount = await prisma.aeProfile.count({ where: { orgId: params.id } });

  // Build server-rendered "Technical" extras: roster + lifecycle / export.
  // These get slotted into the Technical tab via OrgSettingsLayout.
  const technicalExtras = (
    <>
      {/* People in this org — roster grouped by role */}
      <section>
        <header className="flex items-end justify-between mb-3 flex-wrap gap-3">
          <div>
            <div className="eyebrow mb-1">Roster</div>
            <h2 className="h-section">People in {org.name}</h2>
            <p className="meta">{allUsers.length} {allUsers.length === 1 ? "person" : "people"} across {Object.keys(usersByRole).length} {Object.keys(usersByRole).length === 1 ? "role" : "roles"}.</p>
          </div>
          <Link href={`/admin/users/new?orgId=${org.id}`} className="btn-primary text-sm">+ Invite to {org.name}</Link>
        </header>

        {allUsers.length === 0 ? (
          <div className="card p-6 text-sm text-ink-muted">No users yet. Invite the first one to get started.</div>
        ) : (
          <div className="space-y-4">
            {ROLE_ORDER.map((role) => {
              const list = usersByRole[role] ?? [];
              if (list.length === 0) return null;
              return (
                <div key={role} className="card overflow-hidden">
                  <header className="px-5 py-3 border-b border-ink-softLine flex items-center gap-2 bg-surface-soft">
                    <span className={ROLE_BADGE[role] ?? "badge-neutral"}>{prettyRole(role)}</span>
                    <span className="meta">{list.length}</span>
                  </header>
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wider text-ink-muted">
                      <tr>
                        <th className="px-5 py-2 font-semibold">Name</th>
                        <th className="px-5 py-2 font-semibold">Email</th>
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
                                // eslint-disable-next-line @next/next/no-img-element
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
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Lifecycle / data export — ORG_ADMIN gets the full danger-zone panel */}
      {ctx.role === "ORG_ADMIN" && (
        <OrgLifecyclePanel
          orgId={org.id}
          orgName={org.name}
          status={(org as any).status ?? "ACTIVE"}
          isPlatform={isPlatform}
          userCount={allUsers.length}
          aeCount={aeCount}
        />
      )}

      {/* COMPANY_ADMIN gets a slim "export your company's data" card —
          no offboard/deactivate, since they shouldn't shut down their own org. */}
      {ctx.role === "COMPANY_ADMIN" && (
        <section className="mt-10">
          <header className="mb-3">
            <div className="eyebrow">Backups</div>
            <h2 className="h-section">Export company data</h2>
            <p className="text-sm text-ink-muted">
              Download a JSON file with everything in {org.name} — users, profiles, intake responses,
              skill scores, products, knowledge articles, reviews, tasks, and audit log.
              SMTP credentials are scrubbed.
            </p>
          </header>
          <div className="card p-5">
            <a
              href={`/api/admin/orgs/${org.id}/export`}
              className="btn-secondary inline-flex items-center gap-2"
            >
              ⬇ Export {org.name} (JSON)
            </a>
          </div>
        </section>
      )}
    </>
  );

  return (
    <div className="page max-w-3xl">
      <Link href="/admin/orgs" className="link text-sm">
        {isPlatform ? "← All customer orgs" : "← All orgs"}
      </Link>
      <h1 className="h-page mt-2">
        {isPlatform ? <>Platform Settings — <span className="text-brand-orange">{org.name}</span></> : org.name}
      </h1>
      <p className="text-sm text-ink-muted mt-1 mb-6">
        {isPlatform
          ? "Sales Coach AI platform org. SMTP set here is the platform-wide fallback for any customer org without its own."
          : "Onboarding, branding, preferences, technical, and skill benchmarks — all in one place."}
      </p>

      <OrgSettingsLayout
        org={{
          id: org.id,
          name: org.name,
          slug: org.slug,
          brandColor: org.brandColor,
          brandLogoUrl: org.brandLogoUrl,
          websiteUrl: org.websiteUrl,
          brandPalette: (org.brandPalette as any) ?? null,
          aiModel: (org as any).aiModel ?? null,
        }}
        companyProfile={{
          salesMethodology: org.companyProfile?.salesMethodology ?? null,
          values: ((org.companyProfile?.values as any) ?? []) as string[],
          requiredSkills: ((org.companyProfile?.requiredSkills as any) ?? []) as Array<{ category: string; weight: number }>,
          smtpHost: org.companyProfile?.smtpHost ?? null,
          smtpPort: org.companyProfile?.smtpPort ?? null,
          smtpSecure: !!org.companyProfile?.smtpSecure,
          smtpUser: org.companyProfile?.smtpUser ?? null,
          smtpPassSet: !!org.companyProfile?.smtpPass,
          smtpFrom: org.companyProfile?.smtpFrom ?? null,
          // v3.37 — per-org "Improve" button label.
          improveButtonLabel: ((org.companyProfile as any)?.improveButtonLabel) ?? null,
        }}
        viewerRole={ctx.role as "ORG_ADMIN" | "COMPANY_ADMIN"}
        orgName={org.name}
        technicalExtras={technicalExtras}
      />
    </div>
  );
}
