"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function RefreshFromWeb({ orgId, currentUrl }: { orgId: string; currentUrl: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(currentUrl ?? "");
  const [fillMissingOnly, setFillMissingOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true); setError(null); setResult(null);
    const res = await fetch(`/api/orgs/${orgId}/refresh-from-web`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ websiteUrl: url, fillMissingOnly }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Failed.");
      return;
    }
    setResult(await res.json());
    router.refresh();
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} className="btn-secondary text-xs">✨ Refresh from website</button>;
  }
  return (
    <>
      <div className="fixed inset-0 bg-brand-navy/40 z-30" onClick={() => setOpen(false)} />
      <div className="fixed inset-0 z-40 flex items-start justify-center p-6 pointer-events-none overflow-y-auto">
        <div className="card w-full max-w-lg p-6 mt-12 pointer-events-auto animate-slideUp space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="h-section">AI website analysis</h2>
            <button onClick={() => setOpen(false)} className="btn-ghost text-sm">Close</button>
          </div>
          <p className="text-sm text-ink-muted">
            Grok will fetch the page, identify your products, and seed your Knowledge library with a starter set.
            Safe to run on existing orgs — by default, only fills in gaps.
          </p>
          <div>
            <label className="label">Website URL</label>
            <input type="url" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourcompany.com" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={fillMissingOnly} onChange={(e) => setFillMissingOnly(e.target.checked)} />
            Only add new products / articles (skip existing)
          </label>
          {error && <div className="text-sm text-brand-red bg-brand-red/5 border border-brand-red/20 rounded-brand px-3 py-2">{error}</div>}
          {result && (
            <div className="text-sm text-brand-emerald bg-brand-emerald/5 border border-brand-emerald/20 rounded-brand px-3 py-2 space-y-1">
              <div>✓ Created {result.productsCreated} product(s) and {result.articlesCreated} knowledge article(s).</div>
              {result.about && <div className="text-ink-slate text-xs">{result.about}</div>}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button onClick={go} disabled={busy || !url} className="btn-primary">
              {busy ? "Analyzing… (10-30 sec)" : "Run analysis"}
            </button>
            <button onClick={() => setOpen(false)} className="btn-ghost">Done</button>
          </div>
        </div>
      </div>
    </>
  );
}
