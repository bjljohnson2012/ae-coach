"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

function EnhanceOptionButton({
  option, questionText, questionCategory, onApply,
}: {
  option: { value: string; label: string; tags: string[] };
  questionText: string;
  questionCategory: string;
  onApply: (label: string, tags: string[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function go() {
    if (!option.label.trim()) { alert("Enter a label first."); return; }
    setBusy(true);
    const res = await fetch("/api/questions/enhance-option", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionText, questionCategory, option }),
    });
    setBusy(false);
    if (!res.ok) { alert("AI enhance failed."); return; }
    const j = await res.json();
    if (!confirm(`Apply this revision?\n\nLabel: ${j.result.label}\nTags: ${(j.result.tags || []).join(", ")}\n\n${j.result.rationale}`)) return;
    onApply(j.result.label, j.result.tags || []);
  }
  return (
    <button type="button" onClick={go} disabled={busy} className="text-xs text-brand-indigo hover:text-brand-indigoDeep px-1.5 whitespace-nowrap" title="AI enhance this option">
      {busy ? "…" : "✨"}
    </button>
  );
}

const CATEGORIES = [
  "SALES_STYLE", "COMMUNICATION", "PERSONALITY", "ENNEAGRAM", "DISC", "MBTI",
  "MOTIVATION", "RESILIENCE", "PRODUCT_KNOWLEDGE", "LEADERSHIP", "DIRECTOR_MONTHLY_REVIEW",
];
const TYPES = ["LONG_FORM", "MULTIPLE_CHOICE", "LIKERT", "SLIDER"] as const;
type QType = (typeof TYPES)[number];

interface MCOption {
  value: string;
  label: string;
  tags: string[];
}

export function EditQuestionForm({ question }: { question: any }) {
  const router = useRouter();
  const [text, setText] = useState(question.text);
  const [category, setCategory] = useState<string>(question.category);
  const [questionType, setQuestionType] = useState<QType>(question.questionType);
  const [tagsCsv, setTagsCsv] = useState((question.tagsJson || []).join(", "));
  const [active, setActive] = useState(question.active);
  const [weight, setWeight] = useState(question.weight ?? 1.0);
  const [orderHint, setOrderHint] = useState(question.orderHint ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  // MC options as a structured list
  const [options, setOptions] = useState<MCOption[]>(() => {
    if (!question.optionsJson || !Array.isArray(question.optionsJson)) return [];
    return question.optionsJson.map((o: any) => ({
      value: o.value ?? "",
      label: o.label ?? "",
      tags: Array.isArray(o.tags) ? o.tags : [],
    }));
  });

  function addOption() {
    setOptions([...options, { value: `opt${options.length + 1}`, label: "", tags: [] }]);
  }
  function removeOption(i: number) { setOptions(options.filter((_, idx) => idx !== i)); }
  function updateOption(i: number, patch: Partial<MCOption>) {
    setOptions(options.map((o, idx) => idx === i ? { ...o, ...patch } : o));
  }
  function tagsCsvOf(o: MCOption) { return o.tags.join(", "); }
  function setOptionTagsCsv(i: number, csv: string) {
    updateOption(i, { tags: csv.split(",").map((s) => s.trim()).filter(Boolean) });
  }

  async function regenerate() {
    if (!confirm("Generate a fresh draft of this question (same type and category)? You'll see the suggestion before saving.")) return;
    setRegenerating(true);
    const res = await fetch(`/api/questions/${question.id}/regenerate`, { method: "POST" });
    setRegenerating(false);
    if (!res.ok) { alert("Regenerate failed."); return; }
    const j = await res.json();
    if (!j.draft) { alert("AI returned no draft."); return; }
    setText(j.draft.text);
    if (j.draft.tagsJson) setTagsCsv((j.draft.tagsJson as string[]).join(", "));
    if (j.draft.questionType === "MULTIPLE_CHOICE" && Array.isArray(j.draft.optionsJson)) {
      setOptions(j.draft.optionsJson.map((o: any) => ({
        value: o.value ?? "",
        label: o.label ?? "",
        tags: Array.isArray(o.tags) ? o.tags : [],
      })));
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    const tagsJson = tagsCsv.split(",").map((t: string) => t.trim()).filter(Boolean);
    const optionsJson = questionType === "MULTIPLE_CHOICE" ? options.filter((o) => o.value && o.label) : null;
    if (questionType === "MULTIPLE_CHOICE" && (!optionsJson || optionsJson.length < 2)) {
      setError("Multiple-choice questions need at least 2 options with both value and label.");
      setSaving(false);
      return;
    }
    const res = await fetch(`/api/questions/${question.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text, category, questionType,
        optionsJson, tagsJson, active, weight, orderHint,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Save failed.");
      return;
    }
    router.push("/director/questions");
    router.refresh();
  }

  async function softDelete() {
    if (!confirm("Mark this question inactive? It won't show in future wizards.")) return;
    setSaving(true);
    await fetch(`/api/questions/${question.id}`, { method: "DELETE" });
    setSaving(false);
    router.push("/director/questions");
    router.refresh();
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Category</label>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Type</label>
          <select className="input" value={questionType} onChange={(e) => setQuestionType(e.target.value as QType)}>
            {TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
          </select>
          {questionType !== question.questionType && (
            <div className="meta mt-1.5 text-brand-amber font-semibold">
              Switching from {question.questionType.toLowerCase()} — clear or re-edit options if needed.
            </div>
          )}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="label !mb-0">Question text</span>
          <button type="button" onClick={regenerate} disabled={regenerating}
            className="text-xs text-brand-indigo hover:underline disabled:text-ink-muted">
            {regenerating ? "Regenerating…" : "✨ Regenerate with AI"}
          </button>
        </div>
        <textarea className="input min-h-[100px]" value={text} onChange={(e) => setText(e.target.value)} />
        {question.originalText && (
          <div className="meta mt-1.5 italic">Original: {question.originalText}</div>
        )}
      </div>

      {/* Friendly MC options editor */}
      {questionType === "MULTIPLE_CHOICE" && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="label !mb-0">Options</span>
            <button type="button" onClick={addOption} className="btn-secondary text-xs">+ Add option</button>
          </div>
          {options.length === 0 ? (
            <div className="card p-4 text-center text-sm text-ink-muted">
              No options yet. <button onClick={addOption} className="link">Add one →</button>
            </div>
          ) : (
            <ul className="space-y-2">
              {options.map((o, i) => (
                <li key={i} className="border border-ink-softLine rounded-brand p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="meta w-6 text-center">{String.fromCharCode(65 + i)}</span>
                    <input
                      className="input text-xs font-mono w-24"
                      placeholder="value"
                      value={o.value}
                      onChange={(e) => updateOption(i, { value: e.target.value })}
                    />
                    <input
                      className="input flex-1 text-sm"
                      placeholder="What the user reads (e.g. 'Build rapport first.')"
                      value={o.label}
                      onChange={(e) => updateOption(i, { label: e.target.value })}
                    />
                    <EnhanceOptionButton
                      option={o}
                      questionText={text}
                      questionCategory={category}
                      onApply={(label, tags) => updateOption(i, { label, tags })}
                    />
                    <button type="button" onClick={() => removeOption(i)} className="text-brand-red text-xs px-1">remove</button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="meta w-20 shrink-0">Score tags</span>
                    <input
                      className="input text-xs font-mono flex-1"
                      placeholder='e.g. "DISCOVERY:+10, RESILIENCE:-5"'
                      value={tagsCsvOf(o)}
                      onChange={(e) => setOptionTagsCsv(i, e.target.value)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="meta mt-2">Score tags map an answer to skill scores. Format: <code>SKILL:+N</code> or <code>SKILL:-N</code>, comma-separated.</div>
        </div>
      )}

      <div>
        <label className="label">Question-level tags (comma-sep)</label>
        <input className="input" value={tagsCsv} onChange={(e) => setTagsCsv(e.target.value)} />
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className="label">Weight</label>
          <input type="number" step="0.1" min={0} max={5} className="input" value={weight} onChange={(e) => setWeight(Number(e.target.value))} />
        </div>
        <div>
          <label className="label">Order hint</label>
          <input type="number" className="input" value={orderHint} onChange={(e) => setOrderHint(Number(e.target.value))} />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm font-semibold text-ink-slate cursor-pointer">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active
          </label>
        </div>
      </div>
      {error && <div className="text-sm text-brand-red bg-brand-red/5 border border-brand-red/20 rounded-brand px-3 py-2">{error}</div>}
      <div className="flex gap-3 pt-2">
        <button onClick={save} disabled={saving || !text} className="btn-primary">
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button onClick={softDelete} disabled={saving} className="btn-ghost text-brand-red">Mark inactive</button>
      </div>
    </div>
  );
}
