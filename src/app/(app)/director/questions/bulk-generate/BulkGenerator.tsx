"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const CATEGORIES = [
  "SALES_STYLE", "COMMUNICATION", "PERSONALITY", "ENNEAGRAM", "DISC", "MBTI",
  "MOTIVATION", "RESILIENCE", "LEADERSHIP", "DIRECTOR_MONTHLY_REVIEW",
];
const TYPES = ["LONG_FORM", "MULTIPLE_CHOICE", "LIKERT"] as const;
type QType = (typeof TYPES)[number];

interface Draft {
  category: string;
  text: string;
  questionType: QType;
  optionsJson?: any;
  tagsJson: string[];
  rationale?: string;
  selected: boolean;
}

export function BulkGenerator({
  targetOrgId,
  targetOrgName,
}: {
  // ORG_ADMIN authoring on behalf of a specific customer org. Causes both
  // generate AND save to use that org's bank instead of the user's own.
  targetOrgId?: string;
  targetOrgName?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [perCategory, setPerCategory] = useState(5);
  const [genTypes, setGenTypes] = useState<QType[]>(["LONG_FORM", "MULTIPLE_CHOICE", "LIKERT"]);
  const [generating, setGenerating] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function toggleCat(c: string) { setSelected((s) => ({ ...s, [c]: !s[c] })); }
  function toggleType(t: QType) { setGenTypes((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t]); }

  async function generate() {
    const cats = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
    if (cats.length === 0) {
      setMsg({ kind: "err", text: "Pick at least one category." });
      return;
    }
    setGenerating(true); setMsg(null); setDrafts([]);
    setProgress({ done: 0, total: cats.length });
    const all: Draft[] = [];
    for (const cat of cats) {
      try {
        const res = await fetch("/api/questions/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: cat, count: perCategory, types: genTypes }),
        });
        if (res.ok) {
          const j = await res.json();
          for (const d of j.draft || []) {
            all.push({ ...d, category: cat, selected: true });
          }
        }
      } catch {
        /* keep going */
      }
      setProgress((p) => ({ done: (p?.done ?? 0) + 1, total: cats.length }));
    }
    setGenerating(false);
    setProgress(null);
    setDrafts(all);
    if (all.length === 0) setMsg({ kind: "err", text: "AI returned no drafts. Try again." });
  }

  function toggleDraft(i: number) {
    setDrafts((arr) => arr.map((d, idx) => idx === i ? { ...d, selected: !d.selected } : d));
  }

  async function saveSelected() {
    const toSave = drafts.filter((d) => d.selected);
    if (toSave.length === 0) return;
    setSaving(true); setMsg(null);
    let saved = 0;
    let dupSkipped = 0;
    let failed = 0;
    for (const d of toSave) {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: d.category,
          questionType: d.questionType,
          text: d.text,
          optionsJson: d.optionsJson,
          tagsJson: d.tagsJson ?? [],
          aiGenerated: true,
          targetOrgId,
        }),
      });
      if (res.ok) saved++;
      else if (res.status === 409) dupSkipped++;
      else failed++;
    }
    setSaving(false);
    const targetSuffix = targetOrgName ? ` to ${targetOrgName}` : "";
    const parts = [`Saved ${saved} of ${toSave.length} draft questions${targetSuffix}.`];
    if (dupSkipped > 0) parts.push(`${dupSkipped} skipped (duplicates of existing questions).`);
    if (failed > 0) parts.push(`${failed} failed.`);
    setMsg({
      kind: failed > 0 ? "err" : "ok",
      text: parts.join(" "),
    });
    setDrafts([]);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <section className="card p-5 space-y-3">
        <div className="eyebrow">Categories</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CATEGORIES.map((c) => (
            <label key={c} className={`flex items-center gap-2 px-3 py-2 rounded-brand border cursor-pointer transition ${
              selected[c] ? "border-brand-indigo bg-brand-indigo/10" : "border-ink-softLine hover:border-ink-line"
            }`}>
              <input type="checkbox" checked={!!selected[c]} onChange={() => toggleCat(c)} />
              <span className="text-sm">{c.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, m => m.toUpperCase())}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="card p-5 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <div className="eyebrow mb-1">Questions per category</div>
            <div className="flex items-center gap-3">
              <input type="range" min={1} max={15} value={perCategory} onChange={(e) => setPerCategory(Number(e.target.value))} className="flex-1" />
              <span className="font-mono w-8 text-right">{perCategory}</span>
            </div>
          </div>
          <div>
            <div className="eyebrow mb-1">Question types</div>
            <div className="flex flex-wrap gap-1.5">
              {TYPES.map((t) => {
                const on = genTypes.includes(t);
                return (
                  <button key={t} type="button" onClick={() => toggleType(t)}
                    className={`px-3 py-1.5 rounded-brand text-xs font-semibold transition-colors ${
                      on ? "bg-brand-indigo text-white" : "bg-ink-softLine/60 text-ink-slate hover:bg-ink-softLine"
                    }`}
                  >
                    {on && "✓ "}{t.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, m => m.toUpperCase())}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        {progress && (
          <div className="text-sm text-ink-muted">
            Generating: {progress.done} / {progress.total} categories…
          </div>
        )}
        <button onClick={generate} disabled={generating} className="btn-primary">
          {generating ? "Generating…" : "Generate drafts"}
        </button>
      </section>

      {drafts.length > 0 && (
        <section className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="eyebrow">Review drafts</div>
              <div className="text-sm text-ink-muted">Uncheck any you don't want before saving.</div>
            </div>
            <div className="text-sm font-mono">
              {drafts.filter((d) => d.selected).length} / {drafts.length} selected
            </div>
          </div>
          <ul className="divide-y divide-ink-softLine">
            {drafts.map((d, i) => (
              <li key={i} className="py-3 flex items-start gap-3">
                <input type="checkbox" checked={d.selected} onChange={() => toggleDraft(i)} className="mt-1" />
                <div className="flex-1 text-sm">
                  <div className="meta">{d.category.replace(/_/g, " ")} · {d.questionType.replace(/_/g, " ").toLowerCase()}</div>
                  <div className="font-medium">{d.text}</div>
                  {d.rationale && <div className="meta italic mt-1">{d.rationale}</div>}
                </div>
              </li>
            ))}
          </ul>
          <button onClick={saveSelected} disabled={saving || drafts.filter((d) => d.selected).length === 0} className="btn-primary">
            {saving ? "Saving…" : `Save ${drafts.filter((d) => d.selected).length} questions`}
          </button>
        </section>
      )}

      {msg && (
        <div className={`text-sm rounded-brand px-3 py-2 border ${msg.kind === "ok" ? "text-brand-emerald bg-brand-emerald/5 border-brand-emerald/20" : "text-brand-red bg-brand-red/5 border-brand-red/20"}`}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
