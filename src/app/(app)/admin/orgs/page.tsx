import Link from "next/link";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";

export default async function OrgsAdminPage({
  searchParams,
}: {
  searchParams: { show?: string };
}) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN");

  // ?show=inactive lets the admin browse paused/offboarded orgs explicitly.
  // Default view is ACTIVE only.
  const showInactive = searchParams.show === "inactive";

  // Hide platform org(s) — orgs that have an ORG_ADMIN user (Sales Coach AI / Ben's home).
  // Those are managed via Platform Settings instead, not as a customer org.
  // Typed as `any` so we can spread into Prisma.OrgWhereInput without union narrowing pain.
  const baseWhere: any = ctx.role === "ORG_ADMIN"
    ? { users: { none: { role: "ORG_ADMIN" as any } } }
    : { id: ctx.effectiveOrgId };

  const orgs = await prisma.org.findMany({
    where: ctx.role === "ORG_ADMIN"
      ? {
          ...baseWhere,
          status: showInactive ? { in: ["INACTIVE", "OFFBOARDED"] as any } : ("ACTIVE" as any),
        }
      : baseWhere,
    include: { _count: { select: { users: true, aeProfiles: true, products: true } } },
    orderBy: { name: "asc" },
  });

  // Counts for the toggle pills (only shown to ORG_ADMIN)
  const activeCount = ctx.role === "ORG_ADMIN"
    ? await prisma.org.count({ where: { ...baseWhere, status: "ACTIVE" as any } as any })
    : 0;
  const inactiveCount = ctx.role === "ORG_ADMIN"
    ? await prisma.org.count({ where: { ...baseWhere, status: { in: ["INACTIVE", "OFFBOARDED"] as any } } as any })
    : 0;

  return (
    <div className="page">
      <header className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <div className="eyebrow mb-2">{ctx.role === "ORG_ADMIN" ? "Customer organizations" : "Your company"}</div>
          <h1 className="h-page">{ctx.role === "ORG_ADMIN" ? "Customer Orgs" : "Company Settings"}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {ctx.role === "ORG_ADMIN"
              ? "Customer companies on the platform. Your own Sales Coach AI org is managed in Platform Settings."
              : "Edit your company's branding, sales prefs, SMTP, and people."}
          </p>
        </div>
        <div className="flex gap-2">
          {ctx.role === "ORG_ADMIN" && (
            <>
              <Link href="/admin/platform-settings" className="btn-secondary">⚙ Platform Settings</Link>
              <Link href="/admin/orgs/new" className="btn-primary">+ New Org</Link>
            </>
          )}
        </div>
      </header>

      {/* Active / inactive toggle — ORG_ADMIN only */}
      {ctx.role === "ORG_ADMIN" && (activeCount > 0 || inactiveCount > 0) && (
        <div className="flex gap-2 mb-5">
          <Link
            href="/admin/orgs"
            className={`px-4 py-2 rounded-brand text-sm font-semibold transition-colors flex items-center gap-2 border ${
              !showInactive
                ? "bg-brand-indigo text-white border-brand-indigo"
                : "bg-white text-ink border-ink-softLine hover:border-brand-indigo/40"
            }`}
          >
            Active <span className="text-xs opacity-70 font-mono">{activeCount}</span>
          </Link>
          <Link
            href="/admin/orgs?show=inactive"
            className={`px-4 py-2 rounded-brand text-sm font-semibold transition-colors flex items-center gap-2 border ${
              showInactive
                ? "bg-brand-amber text-white border-brand-amber"
                : "bg-white text-ink border-ink-softLine hover:border-brand-amber/40"
            }`}
          >
            Inactive / Offboarded <span className="text-xs opacity-70 font-mono">{inactiveCount}</span>
          </Link>
        </div>
      )}

      {orgs.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-sm text-ink-muted">
            {showInactive
              ? "No inactive or offboarded customer orgs."
              : "No active customer orgs. Click \"+ New Org\" to add one."}
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {orgs.map((o: any) => {
            const status = (o as any).status as "ACTIVE" | "INACTIVE" | "OFFBOARDED" | undefined;
            return (
              <Link key={o.id} href={`/admin/orgs/${o.id}/edit`} className="card-hover p-5 flex items-start gap-4 relative">
                {o.brandLogoUrl ? (
                  <img src={o.brandLogoUrl} alt={o.name} className="w-12 h-12 rounded-brand object-contain bg-white border border-ink-softLine p-1 shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-brand flex items-center justify-center text-white font-display font-bold text-lg shrink-0"
                       style={{ background: o.brandColor || "#0B1F3A" }}>
                    {o.name.charAt(0)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <div className="font-display font-semibold text-ink truncate">{o.name}</div>
                    <span className="meta font-mono">{o.slug}</span>
                  </div>
                  <div className="meta mt-1">
                    {o._count.users} users · {o._count.aeProfiles} AEs · {o._count.products} products
                  </div>
                  {status && status !== "ACTIVE" && (
                    <div className="mt-2">
                      {status === "INACTIVE" && <span className="badge-warning">Paused</span>}
                      {status === "OFFBOARDED" && <span className="badge-neutral">Offboarded</span>}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
