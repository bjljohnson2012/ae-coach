"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface PoolEntry {
  id: string;
  name: string;
  email: string;
  imageUrl: string | null;
}

export function CompareSelector({
  pool,
  selectedIds,
  entityLabel = "AEs",
  routeBase = "/director/compare",
}: {
  pool: PoolEntry[];
  selectedIds: string[];
  // For Slice D — VP Compare Director uses entityLabel="directors" and routeBase="/director/compare-directors".
  entityLabel?: string;
  routeBase?: string;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set(selectedIds));
  const [filter, setFilter] = useState("");

  function toggle(id: string) {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else if (next.size < 4) next.add(id);
    else return; // cap at 4
    setPicked(next);
  }

  function apply() {
    if (picked.size === 0) {
      router.push(routeBase);
    } else {
      router.push(`${routeBase}?ids=${Array.from(picked).join(",")}`);
    }
  }

  function clear() {
    setPicked(new Set());
    router.push(routeBase);
  }

  const filtered = filter.trim()
    ? pool.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()) || p.email.toLowerCase().includes(filter.toLowerCase()))
    : pool;

  return (
    <div className="card p-4 mb-4">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="eyebrow">Pick {entityLabel} to compare</div>
        <div className="text-sm">
          <span className="font-mono font-bold">{picked.size}</span>
          <span className="text-ink-muted"> / 4 selected</span>
        </div>
      </div>
      <input
        type="text"
        className="input mb-3"
        placeholder="Filter by name or email…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-3 max-h-64 overflow-y-auto">
        {filtered.map((p) => {
          const isPicked = picked.has(p.id);
          const isCapped = !isPicked && picked.size >= 4;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              disabled={isCapped}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-brand border text-left transition-colors ${
                isPicked
                  ? "border-brand-indigo bg-brand-indigo/10"
                  : isCapped
                    ? "border-ink-softLine/40 opacity-40 cursor-not-allowed"
                    : "border-ink-softLine hover:border-brand-indigo/50 hover:bg-brand-indigo/5"
              }`}
            >
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt={p.name} className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-indigo to-brand-orange flex items-center justify-center text-white text-[10px] font-bold">
                  {p.name.split(" ").map((q) => q[0]).filter(Boolean).slice(0, 2).join("")}
                </div>
              )}
              <span className="text-xs font-medium truncate">{p.name}</span>
              {isPicked && <span className="ml-auto text-brand-indigo">✓</span>}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2 flex-wrap">
        <button onClick={apply} disabled={picked.size === 0} className="btn-primary text-sm">
          Compare {picked.size > 0 ? picked.size : ""}
        </button>
        <button onClick={clear} className="btn-ghost text-sm">Clear</button>
      </div>
    </div>
  );
}
