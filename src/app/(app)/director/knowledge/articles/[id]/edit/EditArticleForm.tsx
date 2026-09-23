"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const PRESETS = [
  "Tighten this to 300 words; keep all bullet lists.",
  "Make the tone more direct and operator-friendly. Remove fluff.",
  "Add a TL;DR up top and a 'Key takeaways' bullet list at the end.",
  "Reformat into clear sections with H2 headings.",
  "Update terminology to be vendor-neutral.",
];

export function EditArticleForm({ article }: { article: any }) {
  const router = useRouter();
  const [title, setTitle] = useState(article.title);
  const [body, setBody] = useState(article.body);
  const [tagsCsv, setTagsCsv] = useState((article.tagsJson || []).join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI cleanup state
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [cleaning, setCleaning] = useState(false);
  const [diff, setDiff] = useState<{
    title: string; body: string; tags: string[]; changeSummary: string;
    prev: { title: string; body: string; tags: string[] };
  } | null>(null);

  async function save() {
    setSaving(true); setError(null);
    const tagsJson = tagsCsv.split(",").map((s: string) => s.trim()).filter(Boolean);
    const res = await fetch(`/api/knowledge/articles/${article.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, tagsJson }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Save failed.");
      return;
    }
    router.push(`/director/knowledge/repos/${article.repository.id}`);
    router.refresh();
  }

  async function softDelete() {
    if (!confirm("Delete this article? This cannot be undone.")) return;
    setSaving(true);
    const res = await fetch(`/api/knowledge/articles/${article.id}`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) return;
    router.push(`/director/knowledge/repos/${article.repository.id}`);
    router.refresh();
  }

  async function runCleanup() {
    if (!instructions.trim()) return;
    setCleaning(true); setError(null);
    const res = await fetch(`/api/knowledge/articles/${article.id}/cleanup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instructions }),
    });
    setCleaning(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "AI cleanup failed.");
      return;
    }
    const j = await res.json();
    setDiff({
      title: j.revised.title,
      body: j.revised.body,
      tags: j.revised.tags || [],
      changeSummary: j.revised.changeSummary || "",
      prev: { title, body, tags: tagsCsv.split(",").map((s: string) => s.trim()).filter(Boolean) },
    });
  }

  function acceptDiff() {
    if (!diff) return;
    setTitle(diff.title);
    setBody(diff.body);
    setTagsCsv(diff.tags.join(", "));
    setDiff(null);
    setCleanupOpen(false);
    setInstructions("");
  }
  function rejectDiff() {
    setDiff(null);
  }

  return (
    <div className="space-y-4">
      {/* AI cleanup card — top of page */}
      <section className="card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="eyebrow">AI cleanup</div>
            <p className="text-sm text-ink-muted mt-0.5">
              Tell AI what to change. Common: shorten, restructure, change tone, add a TL;DR.
              You'll see the proposed revision before it replaces anything.
            </p>
          </div>
          {!cleanupOpen && (
            <button onClick={() => setCleanupOpen(true)} className="btn-secondary text-sm whitespace-nowrap">
              ✨ Clean up with AI
            </button>
          )}
        </div>
        {cleanupOpen && !diff && (
          <div className="mt-4 space-y-3 animate-slideUp">
            <div>
              <label className="label">Instructions</label>
              <textarea
                className="input min-h-[80px]"
                placeholder="e.g. Tighten to 300 words. Keep the bullet list. Make the tone more direct."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
              <div className="meta mt-1.5">Or pick a preset:</div>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setInstructions(p)}
                    className="text-xs bg-ink-softLine/60 hover:bg-brand-indigo/15 hover:text-brand-indigo rounded-brand px-2.5 py-1 transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={runCleanup} disabled={cleaning || !instructions.trim()} className="btn-primary">
                {cleaning ? "Revising…" : "Generate revision"}
              </button>
              <button onClick={() => { setCleanupOpen(false); setInstructions(""); }} className="btn-ghost">Cancel</button>
            </div>
          </div>
        )}
        {diff && (
          <div className="mt-4 space-y-3 animate-slideUp">
            <div className="border border-brand-amber/40 bg-brand-amber/10 rounded-brand p-3 text-xs">
              <strong>AI summary:</strong> {diff.changeSummary || "(no summary)"}
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <div className="eyebrow mb-1.5">Current</div>
                <div className="card p-3 text-xs whitespace-pre-wrap max-h-80 overflow-y-auto bg-surface-soft">
                  <div className="font-semibold mb-1">{diff.prev.title}</div>
                  {diff.prev.body}
                </div>
              </div>
              <div>
                <div className="eyebrow mb-1.5 text-brand-emerald">Proposed</div>
                <div className="card p-3 text-xs whitespace-pre-wrap max-h-80 overflow-y-auto border-brand-emerald/30 bg-brand-emerald/5">
                  <div className="font-semibold mb-1">{diff.title}</div>
                  {diff.body}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={acceptDiff} className="btn-primary">Accept revision</button>
              <button onClick={rejectDiff} className="btn-secondary">Discard</button>
              <button onClick={() => { setDiff(null); setCleanupOpen(true); }} className="btn-ghost">Try different instructions</button>
            </div>
          </div>
        )}
      </section>

      {/* Editor */}
      <section className="card p-5 space-y-3">
        <div className="eyebrow">Article</div>
        <div>
          <label className="label">Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label">Body (markdown)</label>
          <textarea className="input min-h-[320px] font-mono text-sm" value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <div>
          <label className="label">Tags (comma-sep)</label>
          <input className="input" value={tagsCsv} onChange={(e) => setTagsCsv(e.target.value)} />
        </div>
        {error && <div className="text-sm text-brand-red bg-brand-red/5 border border-brand-red/20 rounded-brand px-3 py-2">{error}</div>}
        <div className="flex gap-2 pt-2">
          <button onClick={save} disabled={saving || !title || !body} className="btn-primary">
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button onClick={softDelete} disabled={saving} className="btn-ghost text-brand-red">Delete</button>
        </div>
      </section>
    </div>
  );
}
