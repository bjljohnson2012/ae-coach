"use client";
import { useEffect, useState } from "react";

interface Narrative {
  summary: string;
  contrasts: string[];
  whoToInvestIn: string;
  collectiveTheme: string;
}

export function CompareNarrative({ aeIds, aeNames }: { aeIds: string[]; aeNames: string[] }) {
  const [data, setData] = useState<Narrative | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/compare/narrative?ids=${aeIds.join(",")}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || "Failed");
        }
        return r.json();
      })
      .then((j) => setData(j.narrative))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [aeIds.join(",")]);

  async function saveAsNote() {
    if (!data) return;
    setSaving(true);
    setSavedMsg(null);
    const lines: string[] = [];
    if (data.summary) lines.push(`**Cohort summary** — ${data.summary}`);
    if (data.collectiveTheme) lines.push(`**Theme** — ${data.collectiveTheme}`);
    if (data.contrasts.length > 0) {
      lines.push("**Contrasts:**");
      lines.push(...data.contrasts.map((c) => `- ${c}`));
    }
    if (data.whoToInvestIn) lines.push(`**Where to invest:** ${data.whoToInvestIn}`);
    const content = lines.join("\n\n");
    const res = await fetch("/api/coaching-notes/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aeProfileIds: aeIds, content, visibleToAe: false }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setSavedMsg(j.error || "Save failed.");
      return;
    }
    const j = await res.json();
    setSavedMsg(`Saved as private coaching note on all ${j.saved} AEs.`);
    setTimeout(() => setSavedMsg(null), 3000);
  }

  return (
    <section className="card p-5 mb-4 bg-gradient-to-br from-brand-indigo/5 to-transparent border-l-4 border-brand-indigo">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="eyebrow">AI insight · {aeNames.join(", ")}</div>
        {data && (
          <button onClick={saveAsNote} disabled={saving} className="btn-ghost text-xs">
            {saving ? "Saving…" : "📌 Save as note on each AE"}
          </button>
        )}
      </div>
      {loading && <div className="text-sm text-ink-muted">Generating insight…</div>}
      {error && <div className="text-sm text-brand-red">{error}</div>}
      {data && (
        <div className="space-y-3 text-sm">
          {data.summary && <p className="leading-relaxed">{data.summary}</p>}
          {data.collectiveTheme && (
            <p className="meta italic">{data.collectiveTheme}</p>
          )}
          {data.contrasts.length > 0 && (
            <div>
              <div className="eyebrow mb-1.5">Contrasts</div>
              <ul className="space-y-1">
                {data.contrasts.map((c, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-brand-indigo font-bold">•</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.whoToInvestIn && (
            <div className="border-l-2 border-brand-orange/60 pl-3 py-1">
              <div className="eyebrow mb-0.5">Where to invest</div>
              <p>{data.whoToInvestIn}</p>
            </div>
          )}
        </div>
      )}
      {savedMsg && <div className="text-xs text-brand-emerald mt-2">{savedMsg}</div>}
    </section>
  );
}
