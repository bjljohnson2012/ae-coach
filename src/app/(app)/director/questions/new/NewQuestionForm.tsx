"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const CATEGORIES = [
  "SALES_STYLE", "COMMUNICATION", "PERSONALITY", "ENNEAGRAM", "DISC", "MBTI",
  "MOTIVATION", "RESILIENCE", "PRODUCT_KNOWLEDGE", "LEADERSHIP", "DIRECTOR_MONTHLY_REVIEW",
];

const TYPES = ["LONG_FORM", "MULTIPLE_CHOICE", "LIKERT", "SLIDER"] as const;
type QType = (typeof TYPES)[number];

interface DuplicateMatch {
  questionId: string;
  text: string;
  scope: "global" | "this-org" | "other-org";
  orgName: string | null;
  category: string;
  productName: string | null;
  exactMatch?: boolean;
}

export function NewQuestionForm({
  presetCategory,
  presetProductId,
  targetOrgId,
  targetOrgName,
  products,
}: {
  presetCategory?: string;
  presetProductId?: string;
  // ORG_ADMIN authoring on behalf of a specific customer org. When set, the
  // create call writes the question to this org's bank instead of the admin's
  // own home org.
  targetOrgId?: string;
  targetOrgName?: string;
  products: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [category, setCategory] = useState(presetCategory ?? "SALES_STYLE");
  const [productId, setProductId] = useState(presetProductId ?? "");
  const [questionType, setQuestionType] = useState<QType>("LONG_FORM");
  const [text, setText] = useState("");
  const [optionsText, setOptionsText] = useState("");
  const [tagsCsv, setTagsCsv] = useState("");

  const [drafts, setDrafts] = useState<any[]>([]);
  const [genCount, setGenCount] = useState(5);
  const [genTypes, setGenTypes] = useState<QType[]>(["LONG_FORM", "MULTIPLE_CHOICE", "LIKERT"]);
  const [genOpen, setGenOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Duplicate detection state
  const [duplicate, setDuplicate] = useState<DuplicateMatch | null>(null);
  const [showDupModal, setShowDupModal] = useState(false);
  const dedupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced inline duplicate check — runs ~600ms after the user stops typing.
  useEffect(() => {
    if (dedupTimer.current) clearTimeout(dedupTimer.current);
    if (text.trim().length < 10) {
      setDuplicate(null);
      return;
    }
    dedupTimer.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ text, category });
        if (targetOrgId) params.set("orgId", targetOrgId);
        const res = await fetch(`/api/questions/check-duplicate?${params}`);
        const j = await res.json();
        setDuplicate(j.match || null);
      } catch {
        // best-effort — silently ignore network errors on the inline check
      }
    }, 600);
    return () => {
      if (dedupTimer.current) clearTimeout(dedupTimer.current);
    };
  }, [text, category, targetOrgId]);

  function toggleType(t: QType) {
    setGenTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    const res = await fetch("/api/questions/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category,
        count: genCount,
        types: genTypes,
        productId: productId || undefined,
      }),
    });
    setGenerating(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Could not generate.");
      return;
    }
    const j = await res.json();
    setDrafts(j.draft || []);
    setGenOpen(false);
  }

  function loadDraft(d: any) {
    setText(d.text);
    setQuestionType(d.questionType);
    setOptionsText(d.optionsJson ? JSON.stringify(d.optionsJson, null, 2) : "");
    setTagsCsv((d.tagsJson || []).join(", "));
  }

  async function save(aiGen: boolean, force = false) {
    setLoading(true);
    setError(null);
    setSuccess(null);
    let optionsJson: any = undefined;
    if (questionType === "MULTIPLE_CHOICE" && optionsText.trim()) {
      try {
        optionsJson = JSON.parse(optionsText);
      } catch {
        setError("Options must be valid JSON");
        setLoading(false);
        return;
      }
    }
    const tagsJson = tagsCsv.split(",").map((t) => t.trim()).filter(Boolean);
    const res = await fetch("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category,
        questionType,
        text,
        optionsJson,
        tagsJson,
        productId: category === "PRODUCT_KNOWLEDGE" ? productId || undefined : undefined,
        targetOrgId: targetOrgId || undefined,
        aiGenerated: aiGen,
        force,
      }),
    });
    setLoading(false);
    if (res.status === 409) {
      // Duplicate — show modal with the match
      const j = await res.json().catch(() => ({}));
      if (j.duplicate) {
        setDuplicate(j.duplicate);
        setShowDupModal(true);
      } else {
        setError(j.error || "Duplicate detected.");
      }
      return;
    }
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Save failed.");
      return;
    }
    setSuccess("Saved.");
    setShowDupModal(false);
    setDuplicate(null);
    setText("");
    setOptionsText("");
    setTagsCsv("");
    setTimeout(() => setSuccess(null), 1500);
  }

  function dupScopeLabel(d: DuplicateMatch): string {
    if (d.scope === "global") return "🌐 Platform (global)";
    if (d.scope === "this-org") return targetOrgName ? `${targetOrgName}'s bank` : "your org's bank";
    return d.orgName ? `${d.orgName}'s bank` : "another org's bank";
  }

  return (
    <div className="space-y-4">
      {/* Authoring-context banner — shown when ORG_ADMIN is writing into a specific customer org */}
      {targetOrgName && (
        <div className="card p-3 bg-brand-indigo/5 border border-brand-indigo/30 text-sm">
          You are authoring this question into <strong>{targetOrgName}</strong>'s bank.
          Only <strong>{targetOrgName}</strong> users will see it. Switch view in the question bank to author elsewhere.
        </div>
      )}

      {/* AI generate dialog */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="eyebrow">AI assist</div>
            <h2 className="h-card mt-1">Generate question drafts</h2>
            <p className="text-sm text-ink-muted mt-1">
              Pick how many and which types you want. Edit drafts before saving.
            </p>
          </div>
          {!genOpen && (
            <button onClick={() => setGenOpen(true)} className="btn-secondary text-sm">
              Generate →
            </button>
          )}
        </div>

        {genOpen && (
          <div className="mt-4 space-y-3 animate-slideUp">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Category</label>
                <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{prettyCat(c)}</option>)}
                </select>
              </div>
              <div>
                <label className="label">How many?</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={20}
                    value={genCount}
                    onChange={(e) => setGenCount(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="font-mono font-semibold text-ink w-8 text-right">{genCount}</span>
                </div>
              </div>
            </div>
            <div>
              <label className="label">Question types (multi-select)</label>
              <div className="flex flex-wrap gap-2">
                {TYPES.map((t) => {
                  const selected = genTypes.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleType(t)}
                      className={`px-3 py-1.5 rounded-brand text-xs font-semibold transition-colors ${
                        selected
                          ? "bg-brand-indigo text-white"
                          : "bg-white border border-ink-line text-ink-slate hover:border-brand-indigo/50"
                      }`}
                    >
                      {selected && "✓ "}{t.replace("_", " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                    </button>
                  );
                })}
              </div>
            </div>
            {category === "PRODUCT_KNOWLEDGE" && products.length > 0 && (
              <div>
                <label className="label">Product</label>
                <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
                  <option value="">— select —</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={generate} disabled={generating || genTypes.length === 0} className="btn-primary text-sm">
                {generating ? "Generating…" : `Generate ${genCount} draft${genCount === 1 ? "" : "s"}`}
              </button>
              <button onClick={() => setGenOpen(false)} className="btn-ghost text-sm">Cancel</button>
            </div>
          </div>
        )}

        {drafts.length > 0 && (
          <div className="mt-5 pt-5 border-t border-ink-softLine">
            <div className="eyebrow mb-2">Drafts ({drafts.length})</div>
            <ul className="space-y-2">
              {drafts.map((d, i) => (
                <li key={i} className="flex items-start gap-3 p-3 rounded-brand bg-surface-soft border border-ink-softLine">
                  <button onClick={() => loadDraft(d)} className="btn-secondary text-xs shrink-0">Use →</button>
                  <div className="flex-1 text-sm">
                    <div>{d.text}</div>
                    <div className="meta mt-0.5">{d.questionType.replace("_", " ").toLowerCase()}{d.rationale ? ` · ${d.rationale}` : ""}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Manual editor */}
      <div className="card p-5 space-y-4">
        <div className="eyebrow">Question editor</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Category</label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{prettyCat(c)}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Type</label>
            <select className="input" value={questionType} onChange={(e) => setQuestionType(e.target.value as QType)}>
              {TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ").toLowerCase()}</option>)}
            </select>
          </div>
        </div>
        {category === "PRODUCT_KNOWLEDGE" && (
          <div>
            <label className="label">Product</label>
            <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">— global / no specific product —</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label">Question text</label>
          <textarea className="input min-h-[80px]" value={text} onChange={(e) => setText(e.target.value)} />

          {/* Inline duplicate warning */}
          {duplicate && (
            <div className="mt-2 p-3 rounded-brand bg-brand-amber/5 border border-brand-amber/40 text-sm">
              <div className="font-semibold text-brand-amber">⚠ Duplicate detected</div>
              <p className="text-ink-slate mt-1">
                A {duplicate.exactMatch !== false ? "matching" : "similar"} question already exists in{" "}
                <strong>{dupScopeLabel(duplicate)}</strong>:
              </p>
              <p className="mt-1 italic">"{duplicate.text}"</p>
              <p className="text-xs text-ink-muted mt-2">
                Recommended: use the existing one instead. If this is intentionally different, click "Save anyway" below.
              </p>
            </div>
          )}
        </div>
        {questionType === "MULTIPLE_CHOICE" && (
          <div>
            <label className="label">Options JSON (array of {`{value, label, tags}`})</label>
            <textarea
              className="input min-h-[140px] font-mono text-xs"
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              placeholder='[{"value":"a","label":"...","tags":["DISCOVERY:+10"]}]'
            />
          </div>
        )}
        <div>
          <label className="label">Tags (comma-separated)</label>
          <input className="input" value={tagsCsv} onChange={(e) => setTagsCsv(e.target.value)} />
        </div>
        {error && <div className="text-sm text-brand-red bg-brand-red/5 border border-brand-red/20 rounded-brand px-3 py-2">{error}</div>}
        {success && <div className="text-sm text-brand-emerald bg-brand-emerald/5 border border-brand-emerald/20 rounded-brand px-3 py-2">{success}</div>}
        <div className="flex gap-3">
          <button onClick={() => save(false)} disabled={loading || !text} className="btn-primary">
            {loading ? "Saving…" : "Save Question"}
          </button>
          <button onClick={() => save(true)} disabled={loading || !text} className="btn-secondary">
            Save as AI-edited
          </button>
          <button onClick={() => router.push("/director/questions")} className="btn-ghost ml-auto">Done</button>
        </div>
      </div>

      {/* Duplicate confirm modal — fires when POST returned 409 */}
      {showDupModal && duplicate && (
        <>
          <div className="fixed inset-0 bg-brand-navy/60 z-30" onClick={() => setShowDupModal(false)} />
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-none">
            <div className="card max-w-lg w-full p-6 pointer-events-auto animate-slideUp">
              <h3 className="h-section text-brand-amber">Duplicate question</h3>
              <p className="text-sm mt-2">
                The text you entered matches an existing question in <strong>{dupScopeLabel(duplicate)}</strong>:
              </p>
              <div className="mt-3 p-3 rounded-brand bg-surface-soft border border-ink-softLine text-sm italic">
                "{duplicate.text}"
              </div>
              <p className="text-sm mt-3">
                We recommend re-using the existing one — having two near-identical questions confuses the synthesis engine.
              </p>
              <div className="flex justify-end gap-2 mt-5 flex-wrap">
                <button onClick={() => setShowDupModal(false)} className="btn-ghost">Cancel</button>
                <a
                  href={`/director/questions/${duplicate.questionId}/edit`}
                  className="btn-secondary"
                >
                  Open existing question →
                </a>
                <button
                  onClick={() => save(false, true)}
                  disabled={loading}
                  className="btn-primary !bg-brand-amber"
                >
                  {loading ? "Saving…" : "Save anyway"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function prettyCat(cat: string) {
  return cat
    .replace("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
