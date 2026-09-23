"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

interface Row {
  id: string;
  title: string;
  subtitle?: string;
  href?: string;
  meta?: string;
}

interface StatResponse {
  kind: string;
  title: string;
  subtitle: string;
  rows: Row[];
  viewAllHref: string;
}

/**
 * Wraps a stat card on the analyze page. Click → drawer with the entity list.
 */
export function StatCardTrigger({
  kind,
  children,
}: {
  kind: "orgs" | "users" | "aes" | "products" | "articles" | "files" | "questions" | "reviews" | "tasks";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<StatResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setData(null);
    setError(null);
    setFilter("");
    fetch(`/api/analyze/stat?kind=${kind}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || "Failed");
        }
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, kind]);

  const filteredRows = data
    ? (filter.trim() === ""
        ? data.rows
        : data.rows.filter((r) =>
            (r.title + " " + (r.subtitle ?? "") + " " + (r.meta ?? "")).toLowerCase().includes(filter.toLowerCase())
          ))
    : [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full text-left transition-all hover:shadow-card hover:-translate-y-0.5 rounded-card"
      >
        {children}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-brand-navy/60 z-30" onClick={() => setOpen(false)} />
          <aside className="fixed right-0 top-0 bottom-0 z-40 w-full max-w-2xl bg-white border-l border-ink-softLine shadow-cardHover overflow-y-auto animate-slideUp">
            <header className="sticky top-0 bg-white border-b border-ink-softLine px-5 py-3 flex items-center justify-between z-10">
              <div>
                <div className="eyebrow">Drill-in</div>
                <div className="font-display font-semibold text-lg">{data?.title ?? "Loading…"}</div>
                {data?.subtitle && <div className="meta mt-0.5">{data.subtitle}</div>}
              </div>
              <button onClick={() => setOpen(false)} className="text-ink-muted hover:text-ink text-lg">✕</button>
            </header>

            <div className="px-5 py-4 space-y-3">
              {data && data.rows.length > 0 && (
                <input
                  type="text"
                  className="input"
                  placeholder={`Search ${data.rows.length} ${data.title.toLowerCase()}…`}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              )}

              {loading && <div className="text-sm text-ink-muted">Loading…</div>}
              {error && <div className="text-sm text-brand-red">{error}</div>}

              {data && filteredRows.length === 0 && !loading && (
                <div className="card p-8 text-center text-sm text-ink-muted">
                  {data.rows.length === 0 ? "Nothing here yet." : "No matches for that search."}
                </div>
              )}

              {filteredRows.length > 0 && (
                <ul className="divide-y divide-ink-softLine border border-ink-softLine rounded-brand">
                  {filteredRows.map((r) => (
                    <li key={r.id}>
                      {r.href ? (
                        <Link
                          href={r.href}
                          className="px-3 py-2.5 flex items-center gap-3 hover:bg-brand-indigo/5 transition-colors"
                          onClick={() => setOpen(false)}
                        >
                          <ResultRow row={r} />
                        </Link>
                      ) : (
                        <div className="px-3 py-2.5 flex items-center gap-3">
                          <ResultRow row={r} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {data && (
                <div className="pt-2">
                  <Link
                    href={data.viewAllHref}
                    className="btn-secondary w-full justify-center inline-flex items-center text-sm"
                    onClick={() => setOpen(false)}
                  >
                    Open in full page →
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

function ResultRow({ row }: { row: Row }) {
  return (
    <>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{row.title}</div>
        {row.subtitle && <div className="meta truncate">{row.subtitle}</div>}
      </div>
      {row.meta && <div className="meta whitespace-nowrap shrink-0">{row.meta}</div>}
      {row.href && (
        <svg className="w-4 h-4 text-ink-muted shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </>
  );
}
