import Link from "next/link";
import { requireRole, getAccessibleAeIds } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";

export default async function VpTeamPage() {
  const ctx = await requireRole("VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");

  const directors = ctx.role === "VP_SALES"
    ? await prisma.user.findMany({
        where: { vpId: ctx.userId, role: "DIRECTOR" },
        select: { id: true, name: true, email: true, imageUrl: true, status: true, directorProfile: { select: { id: true } } },
      })
    : await prisma.user.findMany({
        where: { orgId: ctx.effectiveOrgId, role: "DIRECTOR" },
        select: { id: true, name: true, email: true, imageUrl: true, status: true, directorProfile: { select: { id: true } } },
      });

  const directorIds = directors.map((d) => d.id);
  const aes = directorIds.length === 0
    ? []
    : await prisma.aeProfile.findMany({
        where: { directorId: { in: directorIds } },
        include: {
          user: { select: { name: true, email: true, status: true } },
          skillScores: true,
          director: { select: { id: true, name: true } },
        },
      });

  // Group AEs by director
  const aesByDirector = new Map<string, typeof aes>();
  for (const ae of aes) {
    if (!ae.directorId) continue;
    if (!aesByDirector.has(ae.directorId)) aesByDirector.set(ae.directorId, []);
    aesByDirector.get(ae.directorId)!.push(ae);
  }

  return (
    <div className="page">
      <header className="mb-6">
        <div className="eyebrow mb-2">My Team</div>
        <h1 className="h-page">Reporting tree</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Your directors and the AEs they coach. Click any name to drill in.
        </p>
      </header>

      {directors.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="font-display text-lg font-semibold text-ink mb-1">No directors yet</div>
          <p className="text-sm text-ink-muted">As directors are assigned to you, they'll appear here.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {directors.map((d) => {
            const aesForD = aesByDirector.get(d.id) ?? [];
            const avg =
              aesForD.flatMap((a) => a.skillScores).reduce((s, x) => s + x.score, 0) /
              Math.max(1, aesForD.flatMap((a) => a.skillScores).length);
            return (
              <div key={d.id} className="card overflow-hidden">
                {d.directorProfile?.id ? (
                  <Link
                    href={`/director/director/${d.directorProfile.id}`}
                    className="p-5 bg-gradient-to-r from-brand-indigo/5 to-transparent border-b border-ink-softLine flex items-center gap-4 hover:from-brand-indigo/10 transition-colors"
                  >
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-brand-navy to-brand-indigo flex items-center justify-center text-white font-bold">
                      {d.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <div className="font-display text-lg font-semibold">{d.name}</div>
                      <div className="text-xs text-ink-muted">{d.email}</div>
                    </div>
                    <div className="text-right">
                      <div className="meta">AEs</div>
                      <div className="font-display text-2xl font-bold tracking-tight">{aesForD.length}</div>
                    </div>
                    {aesForD.length > 0 && (
                      <div className="text-right">
                        <div className="meta">Avg score</div>
                        <div className="font-display text-2xl font-bold tracking-tight">{Math.round(avg) || "—"}</div>
                      </div>
                    )}
                    <svg className="w-5 h-5 text-ink-muted shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                ) : (
                  <div className="p-5 bg-gradient-to-r from-brand-indigo/5 to-transparent border-b border-ink-softLine flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-brand-navy to-brand-indigo flex items-center justify-center text-white font-bold">
                      {d.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <div className="font-display text-lg font-semibold">{d.name}</div>
                      <div className="text-xs text-ink-muted">{d.email} · intake pending</div>
                    </div>
                    <div className="text-right">
                      <div className="meta">AEs</div>
                      <div className="font-display text-2xl font-bold tracking-tight">{aesForD.length}</div>
                    </div>
                  </div>
                )}
                {aesForD.length > 0 && (
                  <ul className="divide-y divide-ink-softLine">
                    {aesForD.map((ae) => {
                      const aeAvg =
                        ae.skillScores.length > 0
                          ? Math.round(ae.skillScores.reduce((s, x) => s + x.score, 0) / ae.skillScores.length)
                          : null;
                      return (
                        <li key={ae.id}>
                          <Link href={`/director/ae/${ae.id}`} className="px-5 py-3 flex items-center gap-3 hover:bg-brand-indigo/5 transition-colors">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-indigo to-brand-orange flex items-center justify-center text-white text-sm font-semibold">
                              {ae.user.name.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm">{ae.user.name}</div>
                              <div className="text-xs text-ink-muted truncate">{ae.user.email}</div>
                            </div>
                            {ae.user.status === "PENDING" ? (
                              <span className="badge-warning">Pending</span>
                            ) : ae.lastSynthesizedAt ? (
                              <span className="badge-success">Synthesized</span>
                            ) : (
                              <span className="badge-active">Awaiting wizard</span>
                            )}
                            <span className="font-mono text-sm font-semibold w-10 text-right">{aeAvg ?? "—"}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
