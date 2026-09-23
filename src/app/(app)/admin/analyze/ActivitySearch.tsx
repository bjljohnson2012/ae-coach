"use client";
import { useMemo, useState } from "react";

interface Entry {
  id: string;
  action: string;
  actorName: string;
  targetType: string;
  createdAt: string;
}

export function ActivitySearch({ entries }: { entries: Entry[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const list = !q.trim()
      ? entries
      : entries.filter((e) =>
          (e.action + e.actorName + e.targetType).toLowerCase().includes(q.trim().toLowerCase())
        );
    return list.slice(0, q ? 50 : 10); // show 10 by default, up to 50 when searching
  }, [q, entries]);

  return (
    <>
      <input
        className="input mb-3"
        placeholder="Search by action, actor, or target type…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {filtered.length === 0 ? (
        <p className="text-sm text-ink-muted">No matches.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {filtered.map((a) => (
            <li key={a.id} className="flex justify-between gap-3 py-1 border-b border-ink-softLine/50 last:border-0">
              <span className="text-ink-slate truncate">
                <span className="font-mono text-xs text-ink-muted">{a.action}</span>
                {" — "}{a.actorName} on {a.targetType}
              </span>
              <span className="meta whitespace-nowrap">{new Date(a.createdAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
      {!q && entries.length > 10 && (
        <p className="meta mt-3">Showing 10 most recent. Type to search across the latest {entries.length}.</p>
      )}
    </>
  );
}
