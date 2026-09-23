import Link from "next/link";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { EmailChangeRow } from "./EmailChangeRow";

export default async function EmailChangesPage() {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN");

  const userScope = ctx.role === "ORG_ADMIN" ? {} : { orgId: ctx.effectiveOrgId };
  const users = await prisma.user.findMany({ where: userScope, select: { id: true } });
  const userIds = users.map((u) => u.id);

  const requests = await prisma.emailChangeRequest.findMany({
    where: { userId: { in: userIds } },
    orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
    take: 100,
  });
  const targets = await prisma.user.findMany({
    where: { id: { in: requests.map((r) => r.userId) } },
    select: { id: true, name: true, role: true, org: { select: { name: true } } },
  });
  const byId = new Map(targets.map((t) => [t.id, t]));

  const pending = requests.filter((r) => r.status === "PENDING");
  const decided = requests.filter((r) => r.status !== "PENDING");

  return (
    <div className="page">
      <Link href="/admin/users" className="link text-sm">← Users</Link>
      <header className="mt-2 mb-6">
        <div className="eyebrow mb-2">Approvals</div>
        <h1 className="h-page">Email change requests</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Users can request a new email; you approve or reject. Approvals immediately update the user's login.
        </p>
      </header>

      <section className="card overflow-hidden mb-5">
        <header className="px-5 py-3 border-b border-ink-softLine bg-surface-soft flex items-center justify-between">
          <span className="font-display font-semibold">Pending</span>
          <span className="badge-warning">{pending.length}</span>
        </header>
        {pending.length === 0 ? (
          <div className="p-6 text-sm text-ink-muted text-center">No pending requests.</div>
        ) : (
          <ul className="divide-y divide-ink-softLine">
            {pending.map((r) => (
              <EmailChangeRow key={r.id} request={r as any} user={byId.get(r.userId) as any} />
            ))}
          </ul>
        )}
      </section>

      <section className="card overflow-hidden">
        <header className="px-5 py-3 border-b border-ink-softLine bg-surface-soft flex items-center justify-between">
          <span className="font-display font-semibold">History</span>
          <span className="meta">{decided.length}</span>
        </header>
        {decided.length === 0 ? (
          <div className="p-6 text-sm text-ink-muted text-center">No history yet.</div>
        ) : (
          <ul className="divide-y divide-ink-softLine">
            {decided.map((r) => {
              const u = byId.get(r.userId);
              return (
                <li key={r.id} className="px-5 py-2.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <div>
                      <span className="font-medium">{u?.name ?? "?"}</span>
                      <span className="text-ink-muted"> · {r.currentEmail} → {r.requestedEmail}</span>
                    </div>
                    <span className={r.status === "APPROVED" ? "badge-success" : "badge-error"}>
                      {r.status}
                    </span>
                  </div>
                  {r.rejectionReason && (
                    <div className="meta mt-1 italic">Reason: {r.rejectionReason}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
