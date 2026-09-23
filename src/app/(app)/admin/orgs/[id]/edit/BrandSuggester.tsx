"use client";
import { useState } from "react";

interface Palette {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  neutral: string;
  rationale: string;
}

export function BrandSuggester({ orgId, onPick }: { orgId: string; onPick: (p: Palette) => void }) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [vibe, setVibe] = useState<"" | "professional" | "energetic" | "minimal" | "bold" | "warm">("professional");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [palettes, setPalettes] = useState<Palette[]>([]);

  async function go() {
    setBusy(true); setError(null); setPalettes([]);
    const res = await fetch(`/api/orgs/${orgId}/suggest-brand`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: description || undefined,
        websiteUrl: websiteUrl || undefined,
        preferredVibe: vibe || undefined,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Failed.");
      return;
    }
    const j = await res.json();
    setPalettes(j.palettes || []);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-secondary text-xs">✨ Suggest palettes</button>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-brand-navy/40 z-30" onClick={() => setOpen(false)} />
      <div className="fixed inset-0 z-40 flex items-start justify-center p-6 pointer-events-none overflow-y-auto">
        <div className="card w-full max-w-xl p-6 mt-12 pointer-events-auto animate-slideUp space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="h-section">AI Brand Suggester</h2>
            <button onClick={() => setOpen(false)} className="btn-ghost text-sm">Close</button>
          </div>
          <p className="text-sm text-ink-muted">
            Tell AI a bit about your brand and pick from three palette options.
          </p>
          <div>
            <label className="label">Brand description (optional)</label>
            <textarea
              className="input min-h-[60px]"
              placeholder="e.g. Modern procurement software for state and local agencies. Trustworthy, technical, calm."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Website URL (optional)</label>
            <input className="input" type="url" placeholder="https://yourcompany.com" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} />
          </div>
          <div>
            <label className="label">Vibe</label>
            <div className="flex flex-wrap gap-1.5">
              {(["professional", "energetic", "minimal", "bold", "warm"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setVibe(v)}
                  className={`px-3 py-1.5 rounded-brand text-xs font-semibold transition-colors ${
                    vibe === v ? "bg-brand-indigo text-white" : "bg-ink-softLine/60 text-ink-slate hover:bg-ink-softLine"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          {error && <div className="text-sm text-brand-red bg-brand-red/5 border border-brand-red/20 rounded-brand px-3 py-2">{error}</div>}
          <button onClick={go} disabled={busy} className="btn-primary">
            {busy ? "Generating…" : "Generate 3 palettes"}
          </button>

          {palettes.length > 0 && (
            <div className="pt-4 border-t border-ink-softLine space-y-3">
              {palettes.map((p, i) => (
                <div key={i} className="border border-ink-softLine rounded-brand overflow-hidden">
                  <div className="flex h-12">
                    <div className="flex-1" style={{ background: p.primary }} title={`Primary ${p.primary}`} />
                    <div className="flex-1" style={{ background: p.secondary }} title={`Secondary ${p.secondary}`} />
                    <div className="flex-1" style={{ background: p.accent }} title={`Accent ${p.accent}`} />
                    <div className="flex-1" style={{ background: p.neutral }} title={`Neutral ${p.neutral}`} />
                  </div>
                  <div className="p-3">
                    <div className="font-display font-semibold text-sm">{p.name}</div>
                    <div className="meta">{p.rationale}</div>
                    <div className="flex gap-2 mt-2 text-[10px] font-mono">
                      <span>{p.primary}</span>
                      <span>{p.secondary}</span>
                      <span>{p.accent}</span>
                      <span>{p.neutral}</span>
                    </div>
                    <button
                      onClick={() => { onPick(p); setOpen(false); }}
                      className="btn-secondary text-xs mt-3"
                    >
                      Use this palette →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
