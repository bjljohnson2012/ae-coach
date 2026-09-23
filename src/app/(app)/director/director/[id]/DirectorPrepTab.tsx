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
}

export function DirectorPrepTab({ directorProfileId, name }: { directorProfileId: string; name: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pasteText, setPasteText] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [result, setResult] = useState<PrepResult | null>(null);
  const [priors, setPriors] = useState<PriorPrep[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void loadPriors(); }, [directorProfileId]);

  async function loadPriors() {
    const res = await fetch(`/api/director/${directorProfileId}/prep`);
    const j = await res.json().catch(() => ({}));
    setPriors(j.preps ?? []);
  }

  async function uploadFile(file: File) {
    setError(null);
    setBusy(true);
    setProgress("Extracting text…");
    const fd = new FormData();
    fd.append("file", file);
    setProgress("Generating coaching plan…");
    const res = await fetch(`/api/director/${directorProfileId}/prep`, { method: "POST", body: fd });
    setBusy(false);
    setProgress("");
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Upload failed.");
      return;
    }
    const j = await res.json();
    setResult(j.result);
    await loadPriors();
  }

  async function submitText() {
    if (!pasteText.trim()) { setError("Paste prep text first."); return; }
    setError(null);
    setBusy(true);
    setProgress("Generating coaching plan…");
    const res = await fetch(`/api/director/${directorProfileId}/prep`, {
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
    const j = await res.json();
    setResult(j.result);
    setPasteText("");
    await loadPriors();
  }

  return (
    <div className="space-y-4">
      {!result ? (
        <>
          <div className="card p-5">
            <div className="eyebrow mb-2">Prepare for 1:1 with {name}</div>
            <p className="text-sm text-ink-muted mb-4">
              Upload the prep doc {name} submitted (PDF, DOCX, HTML, TXT, or MD). We'll cross-reference it against
              their leadership profile, forecast discipline, and team roster to generate section-by-section coaching.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt,.md,.html,.htm"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
            />
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="btn-primary"
              >
                {busy ? progress || "Working…" : "📄 Upload prep doc"}
              </button>
              <span className="meta self-center">PDF, DOCX, HTML, TXT, MD up to 10 MB</span>
            </div>
          </div>

          <details className="card p-5">
            <summary className="cursor-pointer text-sm font-semibold">Or paste prep text directly</summary>
            <textarea
              className="input min-h-[200px] mt-3"
              placeholder={`Paste ${name}'s prep doc content here…`}
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

          {priors.length > 0 && (
            <div className="card p-5">
              <div className="eyebrow mb-3">Prior 1:1 preps</div>
              <ul className="space-y-2 text-sm">
                {priors.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => setResult(p.generatedJson)} className="link">
                      {p.prepDocFilename || "Pasted text"} — {new Date(p.createdAt).toLocaleDateString()} · {p.director.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <PrepResultView result={result} onReset={() => setResult(null)} />
      )}
    </div>
  );
}

function PrepResultView({ result, onReset }: { result: PrepResult; onReset: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="eyebrow">Coaching plan</div>
        <button onClick={onReset} className="btn-ghost text-xs">↺ Upload another</button>
      </div>

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
                    <div className="eyebrow mb-0.5">Team / org context</div>
                    <Markdown source={s.tieToProduct} className="text-xs" />
                  </div>
                )}
                {s.tieToPersonality && (
                  <div className="text-xs bg-brand-amber/5 border border-brand-amber/20 rounded-brand p-2">
                    <div className="eyebrow mb-0.5">Personality (your eyes only)</div>
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
