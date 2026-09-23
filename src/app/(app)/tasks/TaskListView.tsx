"use client";
import { useMemo, useState } from "react";
import { CompleteForm } from "./CompleteForm";

/**
 * Client-side task list view — v3.37.2.
 *
 * Owns interactive filter state (search + scope) and renders the three task
 * buckets ("For me" never filtered, "For my team" + "Assigned by me" both
 * filtered). Server-side computes `isDirect` per task so the scope toggle
 * is just a JS filter — no extra round trip.
 *
 * Scope tiers:
 *   - DIRECT  — tasks targeted at the user's own direct reports
 *               (Director: their AEs · VP: their directors · admin: nobody)
 *   - ALL     — every team task the user can see (legacy default)
 *
 * Default scope by role:
 *   - DIRECTOR      → DIRECT (their direct reports ARE their team — no toggle shown)
 *   - VP_SALES      → DIRECT (collapses team-wide noise into just their directors)
 *   - COMPANY_ADMIN → ALL (no useful direct-report concept)
 *   - ORG_ADMIN     → ALL
 */
export type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  dueAt: Date | null;
  status: string;
  completedAt: Date | null;
  createdAt: Date;
  urgency: "OVERDUE" | "URGENT" | "HIGH" | "MEDIUM" | "LOW";
  days: number | null;
  isDirect: boolean;
  /** UI label of who the task is for (AE name or assignee name). */
  ownerName: string | null;
  /** UI label of who created it. */
  creatorName: string | null;
};

interface Props {
  role: "AE" | "DIRECTOR" | "VP_SALES" | "COMPANY_ADMIN" | "ORG_ADMIN";
  forMe: TaskRow[];
  forTeam: TaskRow[];
  byMe: TaskRow[];
  doneByMonth: Array<{ key: string; tasks: TaskRow[] }>;
}

type Scope = "DIRECT" | "ALL";

export function TaskListView({ role, forMe, forTeam, byMe, doneByMonth }: Props) {
  const isLeader = role !== "AE";
  // Director's team query is ALREADY direct-reports (their AEs only) — no
  // toggle needed. VP+ defaults to DIRECT but can flip to ALL.
  const showScopeToggle = role === "VP_SALES" || role === "COMPANY_ADMIN" || role === "ORG_ADMIN";
  const defaultScope: Scope = (role === "VP_SALES") ? "DIRECT" : "ALL";

  const [scope, setScope] = useState<Scope>(defaultScope);
  const [query, setQuery] = useState("");

  const filteredTeam = useMemo(() => filterRows(forTeam, scope, query), [forTeam, scope, query]);
  const filteredByMe = useMemo(() => filterRows(byMe, scope, query), [byMe, scope, query]);

  return (
    <>
      {/* Filter bar — only render for leaders, since AEs only have one bucket */}
      {isLeader && (forTeam.length + byMe.length > 0) && (
        <section className="card p-3 mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Search title, description, or person…"
                className="input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {showScopeToggle && (
              <div className="flex gap-1 shrink-0">
                <ScopeButton active={scope === "DIRECT"} onClick={() => setScope("DIRECT")}>
                  {role === "VP_SALES" ? "My directors" : "Direct reports"}
                </ScopeButton>
                <ScopeButton active={scope === "ALL"} onClick={() => setScope("ALL")}>
                  Everyone
                </ScopeButton>
              </div>
            )}
            {(query || scope !== defaultScope) && (
              <button
                type="button"
                onClick={() => { setQuery(""); setScope(defaultScope); }}
                className="btn-ghost text-xs whitespace-nowrap"
              >
                Reset
              </button>
            )}
          </div>
          <div className="meta mt-2">
            Showing{" "}
            <span className="font-mono">{filteredTeam.length + filteredByMe.length}</span>
            {" of "}
            <span className="font-mono">{forTeam.length + byMe.length}</span>
            {" team / delegated tasks"}
            {scope === "DIRECT" && " · direct reports only"}
            {query && <> · matching "<span className="font-mono">{query}</span>"</>}
          </div>
        </section>
      )}

      {/* Bucket: For me */}
      <Bucket
        title={isLeader ? "For me" : "Open"}
        subtitle={isLeader ? "Things I personally need to do" : "Sorted by urgency · overdue first"}
        rows={forMe}
        emptyHint={
          role === "AE"
            ? "Nothing open. Generate a task or wait for your director to add one."
            : "Nothing on your own list."
        }
        showOwner={false}
      />

      {/* Bucket: For my team — leaders only */}
      {isLeader && (
        <Bucket
          title="For my team"
          subtitle="Tasks assigned to AEs and other team members under me"
          rows={filteredTeam}
          emptyHint={
            forTeam.length === 0
              ? "No open tasks across your team."
              : "No matches in the current filter."
          }
          showOwner={true}
        />
      )}

      {/* Bucket: Assigned by me — leaders only */}
      {isLeader && (
        <Bucket
          title="Assigned by me"
          subtitle="Tasks I created for someone else — open so I can follow up"
          rows={filteredByMe}
          emptyHint={
            byMe.length === 0
              ? "You haven't delegated any open tasks."
              : "No matches in the current filter."
          }
          showOwner={true}
          tone="orange"
        />
      )}

      {/* Completed view — same as before, no filter */}
      {doneByMonth.length > 0 && (
        <section className="mt-8">
          <h2 className="h-section mb-3">Completed</h2>
          <div className="space-y-3">
            {doneByMonth.map(({ key, tasks }) => (
              <div key={key} className="card overflow-hidden">
                <header className="px-5 py-2 bg-surface-soft border-b border-ink-softLine flex items-center justify-between">
                  <span className="font-display font-semibold text-sm">{prettyMonth(key)}</span>
                  <span className="meta">{tasks.length}</span>
                </header>
                <ul className="divide-y divide-ink-softLine">
                  {tasks.map((t) => (
                    <li key={t.id} className="px-5 py-2.5 text-sm">
                      <div className="text-ink-slate line-through">{t.title}</div>
                      <div className="meta">
                        {t.ownerName ? `${t.ownerName} · ` : ""}
                        {t.completedAt ? new Date(t.completedAt).toLocaleDateString() : "—"}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function filterRows(rows: TaskRow[], scope: Scope, query: string): TaskRow[] {
  let out = rows;
  if (scope === "DIRECT") out = out.filter((t) => t.isDirect);
  if (query.trim()) {
    const q = query.toLowerCase();
    out = out.filter((t) =>
      t.title.toLowerCase().includes(q) ||
      (t.description?.toLowerCase().includes(q) ?? false) ||
      (t.ownerName?.toLowerCase().includes(q) ?? false) ||
      (t.creatorName?.toLowerCase().includes(q) ?? false),
    );
  }
  return out;
}

function ScopeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-brand text-xs font-semibold transition-colors ${
        active
          ? "bg-brand-indigo text-white"
          : "bg-ink-softLine/60 text-ink-slate hover:bg-ink-softLine"
      }`}
    >
      {children}
    </button>
  );
}

function Bucket({
  title,
  subtitle,
  rows,
  emptyHint,
  showOwner,
  tone,
}: {
  title: string;
  subtitle: string;
  rows: TaskRow[];
  emptyHint: string;
  showOwner: boolean;
  tone?: "orange";
}) {
  const accent = tone === "orange" ? "border-l-4 border-brand-orange" : "";
  return (
    <section className={`card overflow-hidden mb-5 ${accent}`}>
      <header className="px-5 py-3 border-b border-ink-softLine flex items-center justify-between bg-surface-soft flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="font-display font-semibold">{title}</span>
          <span className="badge-active">{rows.length}</span>
        </div>
        <span className="meta">{subtitle}</span>
      </header>
      {rows.length === 0 ? (
        <div className="px-5 py-6 text-center text-sm text-ink-muted">{emptyHint}</div>
      ) : (
        <ul className="divide-y divide-ink-softLine">
          {rows.map((t) => (
            <li key={t.id} className="px-5 py-3 flex items-start justify-between gap-3 hover:bg-brand-indigo/5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <UrgencyBadge urgency={t.urgency} />
                  <span className="font-medium text-ink">{t.title}</span>
                </div>
                {t.description && <p className="text-sm text-ink-slate mt-1.5 whitespace-pre-wrap">{t.description}</p>}
                <div className="meta mt-1.5">
                  {showOwner && t.ownerName ? (
                    <>For <span className="font-semibold">{t.ownerName}</span> · </>
                  ) : null}
                  {t.dueAt
                    ? `Due ${new Date(t.dueAt).toLocaleDateString()} (${t.days! >= 0 ? `in ${t.days}d` : `${Math.abs(t.days!)}d ago`})`
                    : "No due date"}
                </div>
              </div>
              <CompleteForm taskId={t.id} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function UrgencyBadge({ urgency }: { urgency: TaskRow["urgency"] }) {
  const styles = {
    OVERDUE: "badge-error",
    URGENT: "badge-warning",
    HIGH: "badge-active",
    MEDIUM: "badge-neutral",
    LOW: "badge-neutral",
  } as const;
  return <span className={`${styles[urgency]} text-[10px]`}>{urgency}</span>;
}

function prettyMonth(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}
