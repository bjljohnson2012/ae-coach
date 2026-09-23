"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ArticleCreator({ repositoryId, repositoryName }: { repositoryId: string; repositoryName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"manual" | "ai" | "url">("ai");
  const [rawText, setRawText] = useState("");
  const [filename, setFilename] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagsCsv, setTagsCsv] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function readFile(file: File) {
    setFilename(file.name);
    if (file.type.startsWith("text/") || file.name.endsWith(".md") || file.name.endsWith(".html") || file.name.endsWith(".txt")) {
      const text = await file.text();
      setRawText(text);
    } else {
      setError(`Binary file types (${file.type || "unknown"}) need v3.4. For now, paste text or upload a .txt/.md/.html file.`);
    }
  }

  async function extract() {
    if (!rawText) return;
    setExtracting(true); setError(null);
    const res = await fetch("/api/knowledge/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repositoryId, rawText, filename: filename || undefined }),
    });
    setExtracting(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Extraction failed.");
      return;
    }
    const j = await res.json();
    setTitle(j.result.title || "");
    setBody(j.result.body || "");
    setTagsCsv((j.result.tags || []).join(", "));
    setMode("manual");
  }

  async function extractFromUrl() {
    if (!sourceUrl) return;
    setExtracting(true); setError(null);
    const res = await fetch("/api/knowledge/extract-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repositoryId, url: sourceUrl }),
    });
    setExtracting(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "AI extraction failed. Try again or paste content manually.");
      return;
    }
    const j = await res.json();
    setTitle(j.result.title || "");
    // Body already includes a Source line per the prompt; only append if missing
    const body = j.result.body || "";
    setBody(body.includes(j.sourceUrl) ? body : body + `\n\n_Source:_ ${j.sourceUrl}`);
    setTagsCsv((j.result.tags || []).join(", "));
    if (j.confidence === "low") {
      setError(`Heads up: AI confidence is LOW for this URL. Review the draft carefully before saving.`);
    }
    setMode("manual");
  }

  async function save() {
    setSaving(true); setError(null);
    const tagsJson = tagsCsv.split(",").map((s) => s.trim()).filter(Boolean);

    // Use the legacy POST /api/knowledge endpoint (it auto-finds repo by kind, but we want by id)
    // For repo-id-targeted creation, hit the repo articles route directly
    const res = await fetch("/api/knowledge/repo-articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repositoryId, title, body, tagsJson }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Save failed.");
      return;
    }
    setOpen(false); setTitle(""); setBody(""); setTagsCsv(""); setRawText(""); setFilename("");
    router.refresh();
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} className="btn-accent mt-4">+ New Article</button>;
  }

  return (
    <div className="card p-5 mt-4 space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="h-section">New article in {repositoryName}</h2>
        <span className="meta">·</span>
        <div className="flex gap-1 text-xs">
          <button
            onClick={() => setMode("ai")}
            className={`px-2.5 py-1 rounded-brand font-semibold ${mode === "ai" ? "bg-brand-indigo text-white" : "bg-ink-softLine/60 text-ink-slate"}`}
          >
            File / Text
          </button>
          <button
            onClick={() => setMode("url")}
            className={`px-2.5 py-1 rounded-brand font-semibold ${mode === "url" ? "bg-brand-indigo text-white" : "bg-ink-softLine/60 text-ink-slate"}`}
          >
            From URL
          </button>
          <button
            onClick={() => setMode("manual")}
            className={`px-2.5 py-1 rounded-brand font-semibold ${mode === "manual" ? "bg-brand-indigo text-white" : "bg-ink-softLine/60 text-ink-slate"}`}
          >
            Manual
          </button>
        </div>
      </div>

      {mode === "ai" && !title && (
        <div className="space-y-3">
          <div>
            <label className="label">Upload a text file (.txt, .md, .html) or paste content</label>
            <input
              type="file"
              accept=".txt,.md,.html,text/*"
              onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
              className="block text-sm w-full file:mr-3 file:py-1.5 file:px-3 file:rounded-brand file:border-0 file:bg-brand-indigo/10 file:text-brand-indigo hover:file:bg-brand-indigo/20"
            />
            <div className="meta mt-1.5">For PDF / DOCX, use the Files tab — they get parsed there and routed.</div>
          </div>
          <div>
            <label className="label">Or paste content</label>
            <textarea
              className="input min-h-[160px]"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste any text — meeting notes, training material, customer story, etc."
            />
          </div>
          {error && <div className="text-sm text-brand-red bg-brand-red/5 border border-brand-red/20 rounded-brand px-3 py-2">{error}</div>}
          <button onClick={extract} disabled={extracting || rawText.length < 20} className="btn-primary">
            {extracting ? "Extracting…" : "Extract title, body, tags →"}
          </button>
        </div>
      )}

      {mode === "url" && !title && (
        <div className="space-y-3">
          <div>
            <label className="label">Article URL</label>
            <input
              type="url"
              className="input"
              placeholder="https://example.com/blog/sales-skills"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
            />
            <div className="meta mt-1.5">We'll fetch the page, strip HTML, and ask Grok to write a clean article entry. Works on most public blog posts and docs.</div>
          </div>
          {error && <div className="text-sm text-brand-red bg-brand-red/5 border border-brand-red/20 rounded-brand px-3 py-2">{error}</div>}
          <button onClick={extractFromUrl} disabled={extracting || !sourceUrl} className="btn-primary">
            {extracting ? "Fetching & extracting…" : "Fetch + Extract →"}
          </button>
        </div>
      )}

      {(mode === "manual" || title) && (
        <div className="space-y-3">
          <div>
            <label className="label">Title</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="label">Body (markdown ok)</label>
            <textarea className="input min-h-[220px]" value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div>
            <label className="label">Tags (comma-sep)</label>
            <input className="input" value={tagsCsv} onChange={(e) => setTagsCsv(e.target.value)} />
          </div>
          {error && <div className="text-sm text-brand-red bg-brand-red/5 border border-brand-red/20 rounded-brand px-3 py-2">{error}</div>}
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !title || !body} className="btn-primary">
              {saving ? "Saving…" : "Save article"}
            </button>
            <button onClick={() => { setOpen(false); setTitle(""); setBody(""); setRawText(""); }} className="btn-ghost">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
