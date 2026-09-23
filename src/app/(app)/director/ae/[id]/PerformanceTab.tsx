"use client";
import { useEffect, useState } from "react";

interface Row {
  id: string;
  year: number;
  quarter: number;
  quotaCents: number | null;
  attainedCents: number | null;
  newLogos: number | null;
  meetingsHeld: number | null;
  notes: string | null;
}

function dollars(cents: number | null): string {
  if (cents === null || cents === undefined) return "—";
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function pctOfQuota(quota: number | null, attained: number | null): string {
  if (!quota || quota === 0 || attained === null || attained === undefined) return "—";
  return `${Math.round((attained / quota) * 100)}%`;
}

export function PerformanceTab({ aeProfileId }: { aeProfileId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Row> | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/ae/${aeProfileId}/performance`);
    const j = await res.json().catch(() => ({}));
    setRows(j.rows ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [aeProfileId]);

  function newRow() {
    const now = new Date();
    setEditing({
      year: now.getFullYear(),
      quarter: Math.floor(now.getMonth() / 3) + 1,
      quotaCents: null,
      attainedCents: null,
      newLogos: null,
      meetingsHeld: null,
      notes: "",
    });
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    const res = await fetch(`/api/ae/${aeProfileId}/performance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setMsg(j.error || "Save failed.");
      return;
    }
    setEditing(null);
    setMsg("Saved.");
    setTimeout(() => setMsg(null), 1500);
    await load();
  }

  async function remove(year: number, quarter: number) {
    if (!confirm(`Remove Q${quarter} ${year}?`)) return;
    await fetch(`/api/ae/${aeProfileId}/performance`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, quarter }),
    });
    await load();
  }

  // Aggregate stats
  const lifetime = rows.reduce(
    (acc, r) => ({
      quota: acc.quota + (r.quotaCents ?? 0),
      attained: acc.attained + (r.attainedCents ?? 0),
      logos: acc.logos + (r.newLogos ?? 0),
      meetings: acc.meetings + (r.meetingsHeld ?? 0),
    }),
    { quota: 0, attained: 0, logos: 0, meetings: 0 },
  );

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Career attainment" value={pctOfQuota(lifetime.quota, lifetime.attained)} />
        <Stat label="Total attained" value={dollars(lifetime.attained)} />
        <Stat label="New logos" value={lifetime.logos.toString()} />
        <Stat label="Meetings held" value={lifetime.meetings.toString()} />
      </section>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-ink-softLine flex items-center justify-between">
          <div className="eyebrow">Quarterly performance</div>
          <button onClick={newRow} className="btn-primary text-sm">+ Add quarter</button>
        </div>
        {loading ? (
          <div className="p-5 text-sm text-ink-muted">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-muted">
            No quarterly data yet. Click "+ Add quarter" to record performance.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-ink-muted bg-surface-soft">
              <tr>
                <th className="px-5 py-2.5 font-semibold">Quarter</th>
                <th className="px-5 py-2.5 font-semibold text-right">Quota</th>
                <th className="px-5 py-2.5 font-semibold text-right">Attained</th>
                <th className="px-5 py-2.5 font-semibold text-right">% of Quota</th>
                <th className="px-5 py-2.5 font-semibold text-right">Logos</th>
                <th className="px-5 py-2.5 font-semibold text-right">Meetings</th>
                <th className="px-5 py-2.5 font-semibold">Notes</th>
                <th className="px-5 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pct = r.quotaCents && r.attainedCents !== null ? (r.attainedCents / r.quotaCents) * 100 : null;
                const color = pct === null ? "" : pct >= 100 ? "text-brand-emerald" : pct >= 80 ? "text-brand-indigo" : pct >= 60 ? "text-brand-amber" : "text-brand-red";
                return (
                  <tr key={r.id} className="border-t border-ink-softLine">
                    <td className="px-5 py-3 font-semibold">Q{r.quarter} {r.year}</td>
                    <td className="px-5 py-3 text-right font-mono">{dollars(r.quotaCents)}</td>
                    <td className="px-5 py-3 text-right font-mono">{dollars(r.attainedCents)}</td>
                    <td className={`px-5 py-3 text-right font-mono font-semibold ${color}`}>{pctOfQuota(r.quotaCents, r.attainedCents)}</td>
                    <td className="px-5 py-3 text-right font-mono">{r.newLogos ?? "—"}</td>
                    <td className="px-5 py-3 text-right font-mono">{r.meetingsHeld ?? "—"}</td>
                    <td className="px-5 py-3 text-ink-muted text-xs max-w-[200px] truncate">{r.notes || ""}</td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => setEditing(r)} className="text-xs text-brand-indigo hover:underline mr-2">edit</button>
                      <button onClick={() => remove(r.year, r.quarter)} className="text-xs text-brand-red hover:underline">remove</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <>
          <div className="fixed inset-0 bg-brand-navy/60 z-30" onClick={() => setEditing(null)} />
          <div className="fixed inset-0 z-40 flex items-center justify-center p-6 pointer-events-none">
            <div className="card max-w-lg w-full p-6 pointer-events-auto animate-slideUp">
              <h2 className="h-section">{editing.id ? `Edit Q${editing.quarter} ${editing.year}` : "Add quarter"}</h2>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="label">Year</label>
                  <input type="number" className="input" value={editing.year ?? ""} onChange={(e) => setEditing({ ...editing, year: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="label">Quarter</label>
                  <select className="input" value={editing.quarter ?? 1} onChange={(e) => setEditing({ ...editing, quarter: Number(e.target.value) })}>
                    {[1, 2, 3, 4].map((q) => <option key={q} value={q}>Q{q}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Quota ($)</label>
                  <input type="number" className="input font-mono" value={editing.quotaCents ? editing.quotaCents / 100 : ""} onChange={(e) => setEditing({ ...editing, quotaCents: e.target.value ? Math.round(Number(e.target.value) * 100) : null })} />
                </div>
                <div>
                  <label className="label">Attained ($)</label>
                  <input type="number" className="input font-mono" value={editing.attainedCents ? editing.attainedCents / 100 : ""} onChange={(e) => setEditing({ ...editing, attainedCents: e.target.value ? Math.round(Number(e.target.value) * 100) : null })} />
                </div>
                <div>
                  <label className="label">New logos</label>
                  <input type="number" className="input font-mono" value={editing.newLogos ?? ""} onChange={(e) => setEditing({ ...editing, newLogos: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div>
                  <label className="label">Meetings held</label>
                  <input type="number" className="input font-mono" value={editing.meetingsHeld ?? ""} onChange={(e) => setEditing({ ...editing, meetingsHeld: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div className="col-span-2">
                  <label className="label">Notes</label>
                  <textarea className="input min-h-[80px]" value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={save} disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save"}</button>
                <button onClick={() => setEditing(null)} className="btn-ghost">Cancel</button>
              </div>
            </div>
          </div>
        </>
      )}

      {msg && <div className="text-sm text-brand-emerald">{msg}</div>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="eyebrow">{label}</div>
      <div className="font-display text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
