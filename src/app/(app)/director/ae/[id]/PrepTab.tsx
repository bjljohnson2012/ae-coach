"use client";
import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/Markdown";

interface PrepSection {
  title: string;
  bringUp: string;
  howToBringIt: string;
  questions: string[];
  tieToSkill?: string;
  tieToProduct?: string;
  tieToPersonality?: string;
}

interface PrepResult {
  summary: string;
  priorities: string[];
  sections: PrepSection[];
  watchOuts: string[];
  closingMove: string;
}

interface PriorPrep {
  id: string;
  prepDocFilename: string | null;
  generatedJson: PrepResult;
  createdAt: string;
  director: { name: string };
  // Background-job fields. While a prep is GENERATING, generatedJson is empty
  // and the row is shown with a spinner. The frontend polls for completion.
  status?: "GENERATING" | "READY" | "FAILED";
  errorMessage?: string | null;
  startedAt?: string;
  completedAt?: string | null;
}

/** Group preps by year-quarter, then by ISO week. */
function groupByQuarter(preps: PriorPrep[]) {
  const groups = new Map<string, Map<string, PriorPrep[]>>();
  for (const p of preps) {
    const d = new Date(p.createdAt);
    const year = d.getUTCFullYear();
    const q = Math.floor(d.getUTCMonth() / 3) + 1;
    const qKey = `Q${q} ${year}`;
    // Week key — year + ISO-ish week
    const onejan = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getUTCDay() + 1) / 7);
    const weekKey = `Week ${weekNum} · ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
    if (!groups.has(qKey)) groups.set(qKey, new Map());
    const weekMap = groups.get(qKey)!;
    if (!weekMap.has(weekKey)) weekMap.set(weekKey, []);
    weekMap.get(weekKey)!.push(p);
  }
  return groups;
}

export function PrepTab({ aeProfileId, aeName }: { aeProfileId: string; aeName: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pasteText, setPasteText] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>("");
  // popout result — shown in a slide-in drawer, not inline
  const [popoutResult, setPopoutResult] = useState<PrepResult | null>(null);
  const [popoutMeta, setPopoutMeta] = useState<{ title: string; date: string; director: string } | null>(null);
  const [priors, setPriors] = useState<PriorPrep[]>([]);
  const [openQuarters, setOpenQuarters] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void loadPriors(); }, [aeProfileId]);

  // Background-job polling: any time we have GENERATING preps in the priors
  // list, poll their status every 4 seconds until they flip to READY/FAILED.
  // Survives navigation — the work continues server-side. Coming back to
  // this tab will pick up the in-progress prep and resume polling.
  useEffect(() => {
    const generatingIds = priors.filter((p) => p.status === "GENERATING").map((p) => p.id);
    if (generatingIds.length === 0) return;

    let cancelled = false;
    const tick = async () => {
      for (const id of generatingIds) {
        try {
          const res = await fetch(`/api/preps/${id}`);
          if (!res.ok) continue;
          const j = await res.json();
          if (cancelled) return;
          if (j.prep?.status && j.prep.status !== "GENERATING") {
            // Status flipped — refresh the priors list to show the result.
            await loadPriors();
            return;
          }
        } catch {
          /* ignore transient errors and try next tick */
        }
      }
    };
    const interval = setInterval(tick, 4000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [priors]);

  function openPopout(res: PrepResult, p?: PriorPrep) {
    setPopoutResult(res);
    setPopoutMeta(p ? {
      title: p.prepDocFilename || "Pasted text",
      date: new Date(p.createdAt).toLocaleDateString(),
      director: p.director.name,
    } : { title: "Just generated", date: new Date().toLocaleDateString(), director: "you" });
  }

  async function loadPriors() {
    const res = await fetch(`/api/ae/${aeProfileId}/prep`);
    const j = await res.json().catch(() => ({}));
    setPriors(j.preps ?? []);
  }

  // Submit handlers — both upload and paste now kick off a background job.
  // We get a prep ID back immediately, refresh the priors list (so the new
  // prep appears with a "generating" badge), and the polling effect above
  // takes over from there. Safe to navigate away.

  async function uploadFile(file: File) {
    setError(null);
    setBusy(true);
    setProgress("Uploading…");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/ae/${aeProfileId}/prep`, { method: "POST", body: fd });
    setBusy(false);
    setProgress("");
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Upload failed.");
      return;
    }
    // Background generation kicked off. Refresh priors so the new GENERATING
    // row shows up immediately. Polling will swap it to READY when done.
    await loadPriors();
  }

  async function submitText() {
    if (!pasteText.trim()) { setError("Paste your prep doc text first."); return; }
    setError(null);
    setBusy(true);
    setProgress("Submitting…");
    const res = await fetch(`/api/ae/${aeProfileId}/prep`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prepDocText: pasteText }),
    });
    setBusy(false);
    setProgress("");
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Failed.");
      return;
    }
    setPasteText("");
    await loadPriors();
  }

  const quarterGroups = groupByQuarter(priors);
  const quarterKeys = Array.from(quarterGroups.keys()); // already sorted by descending date due to API order

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="eyebrow mb-2">Prepare for 1:1 with {aeName}</div>
        <p className="text-sm text-ink-muted mb-4">
          Upload {aeName}'s prep doc (PDF, DOCX, HTML, or TXT). We'll cross-reference it against their personality,
          skill scores, and recent coaching to generate a section-by-section coaching plan.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.doc,.txt,.md,.html,.htm"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
        />
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => fileRef.current?.click()} disabled={busy} className="btn-primary">
            {busy ? progress || "Working…" : "📄 Upload prep doc"}
          </button>
          <span className="meta self-center">PDF, DOCX, HTML, TXT, MD up to 10 MB</span>
        </div>
      </div>

      <details className="card p-5">
        <summary className="cursor-pointer text-sm font-semibold">Or paste prep text directly</summary>
        <textarea
          className="input min-h-[200px] mt-3"
          placeholder={`Paste ${aeName}'s prep doc content here…`}
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
        />
        <button onClick={submitText} disabled={busy} className="btn-primary mt-3">
          {busy ? progress || "Working…" : "Generate from text"}
        </button>
      </details>

      {error && (
        <div className="text-sm rounded-brand px-3 py-2 border text-brand-red bg-brand-red/5 border-brand-red/20">
          {error}
        </div>
      )}

      {/* Historical preps grouped by quarter → expandable to show weeks */}
      {priors.length > 0 && (
        <div className="card overflow-hidden">
          <header className="px-5 py-3 border-b border-ink-softLine bg-surface-soft">
            <div className="font-display font-semibold">1:1 prep history</div>
            <div className="meta">{priors.length} session{priors.length === 1 ? "" : "s"} · grouped by quarter</div>
          </header>
          <ul className="divide-y divide-ink-softLine">
            {quarterKeys.map((q) => {
              const weeks = quarterGroups.get(q)!;
              const weekKeys = Array.from(weeks.keys());
              const weekCount = weekKeys.length;
              const totalSessions = Array.from(weeks.values()).reduce((s, ps) => s + ps.length, 0);
              const expanded = openQuarters[q];
              return (
                <li key={q}>
                  <button
                    type="button"
                    onClick={() => setOpenQuarters((o) => ({ ...o, [q]: !o[q] }))}
                    className="w-full px-5 py-3 flex items-center gap-3 text-left hover:bg-surface-soft transition-colors"
                  >
                    <svg
                      className={`w-4 h-4 text-ink-muted transition-transform ${expanded ? "rotate-90" : ""}`}
                      fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"
                    >
                      <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="font-display font-semibold">{q}</span>
                    <span className="meta ml-auto">
                      {weekCount} week{weekCount === 1 ? "" : "s"} · {totalSessions} session{totalSessions === 1 ? "" : "s"}
                    </span>
                  </button>
                  {expanded && (
                    <ul className="pl-9 pr-5 pb-3 space-y-1.5">
                      {weekKeys.map((weekKey) => {
                        const sessions = weeks.get(weekKey)!;
                        return (
                          <li key={weekKey}>
                            <div className="text-xs uppercase tracking-wider text-ink-muted mt-2 mb-1">{weekKey}</div>
                            <ul className="space-y-1">
                              {sessions.map((p) => {
                                const isGenerating = p.status === "GENERATING";
                                const isFailed = p.status === "FAILED";
                                return (
                                  <li key={p.id}>
                                    <button
                                      type="button"
                                      onClick={() => !isGenerating && !isFailed && openPopout(p.generatedJson, p)}
                                      disabled={isGenerating || isFailed}
                                      className={`text-sm rounded-brand px-2 py-1 -mx-2 w-full text-left flex items-center gap-2 transition-colors ${
                                        isGenerating || isFailed ? "cursor-default" : "hover:bg-brand-indigo/5"
                                      }`}
                                    >
                                      <span className={isGenerating ? "text-brand-amber" : isFailed ? "text-brand-red" : "text-brand-indigo"}>
                                        {isGenerating ? "⏳" : isFailed ? "⚠" : "📄"}
                                      </span>
                                      <span className={`font-medium ${isFailed ? "text-brand-red" : ""}`}>
                                        {p.prepDocFilename || "Pasted text"}
                                      </span>
                                      {isGenerating && (
                                        <span className="badge-warning text-[10px]">Generating… (safe to leave)</span>
                                      )}
                                      {isFailed && (
                                        <span className="badge-warning text-[10px] !text-brand-red !bg-brand-red/10 !border-brand-red/20">
                                          Failed: {p.errorMessage?.slice(0, 60) ?? "unknown error"}
                                        </span>
                                      )}
                                      <span className="meta ml-auto">{p.director.name} · {new Date(p.createdAt).toLocaleDateString()}</span>
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Pop-out drawer */}
      {popoutResult && (
        <>
          <div className="fixed inset-0 bg-brand-navy/60 z-30" onClick={() => setPopoutResult(null)} />
          <aside className="fixed right-0 top-0 bottom-0 z-40 w-full max-w-3xl bg-white border-l border-ink-softLine shadow-cardHover overflow-y-auto animate-slideUp">
            <header className="sticky top-0 bg-white border-b border-ink-softLine px-5 py-3 flex items-center justify-between z-10">
              <div>
                <div className="eyebrow">Coaching plan</div>
                <div className="font-display font-semibold text-lg">{popoutMeta?.title}</div>
                <div className="meta mt-0.5">{popoutMeta?.date} · {popoutMeta?.director}</div>
              </div>
              <button onClick={() => setPopoutResult(null)} className="text-ink-muted hover:text-ink text-lg">✕</button>
            </header>
            <div className="px-5 py-4">
              <PrepResultView result={popoutResult} />
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

function PrepResultView({ result }: { result: PrepResult }) {
  return (
    <div className="space-y-4">
      {result.summary && (
        <div className="card p-5 bg-brand-indigo/5 border-l-4 border-brand-indigo">
          <div className="eyebrow mb-1">Summary</div>
          <p className="text-sm">{result.summary}</p>
        </div>
      )}

      {result.priorities && result.priorities.length > 0 && (
        <div className="card p-5">
          <div className="eyebrow mb-2">Top priorities for this 1:1</div>
          <ol className="list-decimal pl-5 space-y-1.5 text-sm">
            {result.priorities.map((p, i) => <li key={i} className="font-semibold">{p}</li>)}
          </ol>
        </div>
      )}

      {result.sections && result.sections.length > 0 && (
        <div className="space-y-3">
          {result.sections.map((s, i) => (
            <section key={i} className="card p-5">
              <h3 className="font-display font-bold text-lg mb-2">{s.title}</h3>
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="eyebrow mb-1">What to bring up</div>
                  <Markdown source={s.bringUp || ""} />
                </div>
                <div>
                  <div className="eyebrow mb-1">How to bring it up</div>
                  <Markdown source={s.howToBringIt || ""} />
                </div>
              </div>
              {s.questions && s.questions.length > 0 && (
                <div className="mt-3">
                  <div className="eyebrow mb-1">Questions to ask</div>
                  <ul className="space-y-1 text-sm">
                    {s.questions.map((q, j) => (
                      <li key={j} className="pl-3 border-l-2 border-brand-orange/40">{q}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="grid sm:grid-cols-3 gap-3 mt-3">
                {s.tieToSkill && (
                  <div className="text-xs bg-brand-emerald/5 border border-brand-emerald/20 rounded-brand p-2">
                    <div className="eyebrow mb-0.5">Skill tie-in</div>
                    <Markdown source={s.tieToSkill} className="text-xs" />
                  </div>
                )}
                {s.tieToProduct && (
                  <div className="text-xs bg-brand-indigo/5 border border-brand-indigo/20 rounded-brand p-2">
                    <div className="eyebrow mb-0.5">Product mastery</div>
                    <Markdown source={s.tieToProduct} className="text-xs" />
                  </div>
                )}
                {s.tieToPersonality && (
                  <div className="text-xs bg-brand-amber/5 border border-brand-amber/20 rounded-brand p-2">
                    <div className="eyebrow mb-0.5">Personality (director-only)</div>
                    <Markdown source={s.tieToPersonality} className="text-xs" />
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {result.watchOuts && result.watchOuts.length > 0 && (
        <div className="card p-5 bg-brand-amber/5 border-l-4 border-brand-amber">
          <div className="eyebrow mb-2">Watch-outs</div>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            {result.watchOuts.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {result.closingMove && (
        <div className="card p-5 bg-brand-emerald/5 border-l-4 border-brand-emerald">
          <div className="eyebrow mb-1">Closing move</div>
          <p className="text-sm">{result.closingMove}</p>
        </div>
      )}
    </div>
  );
}
