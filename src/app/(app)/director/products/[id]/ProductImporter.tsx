"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function ProductImporter({ productId, productName }: { productId: string; productName: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function add(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
  }

  function remove(i: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function go() {
    if (files.length === 0) return;
    setBusy(true); setError(null); setResult(null);
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    const res = await fetch(`/api/products/${productId}/synthesize`, { method: "POST", body: fd });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Import failed.");
      return;
    }
    const j = await res.json();
    setResult(j);
    setFiles([]);
    router.refresh();
  }

  return (
    <section className="card p-5">
      <div className="eyebrow mb-1">AI import</div>
      <h2 className="h-section">Synthesize {productName} from source files</h2>
      <p className="text-sm text-ink-muted mt-1 mb-4">
        Upload as many files as you want — datasheets, decks, demo recordings (transcribed), Slack threads.
        AI extracts each, indexes them, and generates a single Product Brief.
      </p>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); add(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
        className={`p-6 rounded-brand border-2 border-dashed text-center cursor-pointer transition-all ${
          dragOver ? "border-brand-orange bg-brand-orange/5" : "border-ink-line hover:border-brand-indigo/40"
        }`}
      >
        <input ref={fileRef} type="file" multiple className="hidden"
          accept=".pdf,.docx,.txt,.md,.html"
          onChange={(e) => add(e.target.files)} />
        <div className="text-2xl mb-1">{dragOver ? "⬇️" : "📎"}</div>
        <div className="font-display font-semibold">{dragOver ? "Drop files" : "Drop files or click to add"}</div>
        <p className="meta mt-1">PDF, DOCX, TXT, MD, HTML · 50 MB each · multiple OK</p>
      </div>

      {files.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {files.map((f, i) => (
            <li key={i} className="flex items-center justify-between text-sm bg-surface-soft rounded-brand px-3 py-2 border border-ink-softLine">
              <span className="truncate flex-1">📄 {f.name}</span>
              <span className="meta mx-2">{(f.size / 1024).toFixed(0)} KB</span>
              <button onClick={() => remove(i)} className="text-brand-red text-xs">Remove</button>
            </li>
          ))}
        </ul>
      )}

      {error && <div className="text-sm text-brand-red bg-brand-red/5 border border-brand-red/20 rounded-brand px-3 py-2 mt-3">{error}</div>}
      {result && (
        <div className="space-y-2 mt-3">
          <div className={`text-sm rounded-brand px-3 py-2 border ${
            result.ok
              ? "text-brand-emerald bg-brand-emerald/5 border-brand-emerald/20"
              : "text-brand-amber bg-brand-amber/5 border-brand-amber/20"
          }`}>
            {result.ok ? "✓" : "⚠"} {result.summary}
          </div>
          {Array.isArray(result.outcomes) && result.outcomes.length > 0 && (
            <ul className="text-xs space-y-1">
              {result.outcomes.map((o: any, i: number) => (
                <li key={i} className="flex items-baseline gap-2">
                  {o.status === "ok" ? <span className="text-brand-emerald">✓</span> :
                   o.status === "skipped" ? <span className="text-brand-amber">○</span> :
                   <span className="text-brand-red">✗</span>}
                  <span className="font-mono truncate">{o.filename}</span>
                  {o.title && <span className="text-ink-muted">→ {o.title}</span>}
                  {o.reason && <span className="text-brand-red">— {o.reason}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <button onClick={go} disabled={busy || files.length === 0} className="btn-primary">
          {busy ? "Synthesizing…" : `Synthesize ${files.length || ""} file${files.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </section>
  );
}
