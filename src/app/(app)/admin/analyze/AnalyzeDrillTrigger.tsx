"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

interface AeRow {
  id: string;
  name: string;
  email: string;
  imageUrl: string | null;
  directorName: string | null;
  score?: number | null;
}

interface DrillResponse {
  title: string;
  subtitle: string;
  rows: AeRow[];
  viewAllHref: string;
}

/**
 * Wraps a clickable cell on /admin/analyze. Click → opens slide-in drawer
 * with filtered AE list. Drawer has a "View all in detail →" link to the
 * full /admin/analyze/drill page for deep-dive features.
 */
export function AnalyzeDrillTrigger({
  kind,
  type,
  value,
  category,
  min = 0,
  max = 100,
  children,
}: {
  kind: "personality" | "skill";
  type?: string;
  value?: string;
  category?: string;
  min?: number;
  max?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<DrillResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setData(null);
    setError(null);
    const params = new URLSearchParams();
    params.set("kind", kind);
    if (type) params.set("type", type);
    if (value) params.set("value", value);
    if (category) params.set("category", category);
    params.set("min", String(min));
    params.set("max", String(max));
    fetch(`/api/analyze/drill?${params}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || "Failed to load");
        }
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, kind, type, value, category, min, max]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block w-full text-left">
        {children}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-brand-navy/60 z-30" onClick={() => setOpen(false)} />
          <aside className="fixed right-0 top-0 bottom-0 z-40 w-full max-w-xl bg-white border-l border-ink-softLine shadow-cardHover overflow-y-auto animate-slideUp">
            <header className="sticky top-0 bg-white border-b border-ink-softLine px-5 py-3 flex items-center justify-between z-10">
              <div>
                <div className="eyebrow">Drill-in</div>
                <div className="font-display font-semibold text-lg">{data?.title ?? "Loading…"}</div>
                {data?.subtitle && <div className="meta mt-0.5">{data.subtitle}</div>}
              </div>
              <button onClick={() => setOpen(false)} className="text-ink-muted hover:text-ink text-lg" aria-label="Close">✕</button>
            </header>

            <div className="px-5 py-4 space-y-3">
              {loading && <div className="text-sm text-ink-muted">Loading…</div>}
              {error && <div className="text-sm text-brand-red">{error}</div>}

              {data && data.rows.length === 0 && (
                <div className="card p-8 text-center text-sm text-ink-muted">No AEs match this filter.</div>
              )}

              {data && data.rows.length > 0 && (
                <ul className="divide-y divide-ink-softLine border border-ink-softLine rounded-brand">
                  {data.rows.map((ae) => (
                    <li key={ae.id} className="px-3 py-2 flex items-center gap-3">
                      {ae.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={ae.imageUrl} alt={ae.name} className="w-9 h-9 rounded-full object-cover ring-1 ring-ink-softLine" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-indigo to-brand-orange flex items-center justify-center text-white text-xs font-bold">
                          {ae.name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("")}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <Link href={`/director/ae/${ae.id}`} className="font-medium text-ink hover:underline truncate block">
                          {ae.name}
                        </Link>
                        <div className="meta truncate">
                          {ae.directorName ? `reports to ${ae.directorName}` : ae.email}
                        </div>
                      </div>
                      {ae.score !== null && ae.score !== undefined && (
                        <div className="text-right">
                          <div className="font-mono font-bold">{ae.score}</div>
                        </div>
                      )}
                      <Link href={`/director/ae/${ae.id}`} className="btn-ghost text-xs shrink-0" onClick={() => setOpen(false)}>
                        Open →
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              {data && (
                <div className="pt-2">
                  <Link href={data.viewAllHref} className="btn-secondary w-full justify-center inline-flex items-center text-sm" onClick={() => setOpen(false)}>
                    View all in detail →
                  </Link>
                </div>
              )}
            </div>
          </aside>
        </>
      )}
    </>
  );
}
