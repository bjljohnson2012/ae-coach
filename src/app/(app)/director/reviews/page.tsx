import Link from "next/link";
import { requireRole, getAccessibleAeIds } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { NewReviewButton } from "./NewReviewButton";

export default async function ReviewsPage() {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");

  const aeIds = await getAccessibleAeIds(ctx);

  const reviews = await prisma.directorReview.findMany({
    where: ctx.role === "ORG_ADMIN" ? {} : { aeProfileId: { in: aeIds } },
    include: { aeProfile: { include: { user: { select: { name: true } } } } },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }],
  });

  const aes = aeIds.length === 0
    ? []
    : await prisma.aeProfile.findMany({
        where: { id: { in: aeIds } },
        include: { user: { select: { name: true } } },
      });

  const pending = reviews.filter((r) => r.status === "PENDING" || r.status === "IN_PROGRESS");
  const done = reviews.filter((r) => r.status === "COMPLETED");

  return (
    <div className="page">
      <header className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="eyebrow mb-2">Coaching cadence</div>
          <h1 className="h-page">Reviews</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Monthly reviews are auto-created. Use ad-hoc for one-off coaching sessions or post-call debriefs.
          </p>
        </div>
        <NewReviewButton aes={aes.map((a) => ({ id: a.id, name: a.user.name }))} />
      </header>

      <section className="card p-5 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="font-display font-semibold">Pending</span>
          <span className="badge-warning">{pending.length}</span>
        </div>
        {pending.length === 0 ? (
          <p className="text-sm text-ink-muted">All caught up. New reviews appear here as they come due.</p>
        ) : (
          <ul className="divide-y divide-ink-softLine">
            {pending.map((r) => (
              <li key={r.id} className="py-2 flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">{r.aeProfile.user.name}</div>
                  <div className="meta">
                    {r.summary ? `Ad-hoc: ${r.summary} · ` : `Month: ${r.monthOf.toISOString().slice(0, 7)} · `}
                    due {r.dueAt.toLocaleDateString()}
                  </div>
                </div>
                <Link className="btn-primary text-sm" href={`/director/reviews/${r.id}`}>Start →</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="font-display font-semibold">Completed</span>
          <span className="badge-success">{done.length}</span>
        </div>
        {done.length === 0 ? (
          <p className="text-sm text-ink-muted">No reviews completed yet.</p>
        ) : (
          <ul className="divide-y divide-ink-softLine">
            {done.map((r) => (
              <li key={r.id} className="py-2 text-sm">
                <div className="font-medium">{r.aeProfile.user.name}</div>
                <div className="meta">{r.monthOf.toISOString().slice(0, 7)} · completed {r.completedAt?.toLocaleDateString()}</div>
                {r.summary && <p className="mt-1 text-ink-slate line-clamp-2">{r.summary}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
