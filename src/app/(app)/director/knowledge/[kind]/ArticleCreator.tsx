"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ArticleCreator({ kind }: { kind: "PRODUCT" | "SALES_SKILL" | "PERSONALITY" | "LEADERSHIP" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagsCsv, setTagsCsv] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true); setError(null);
    const res = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        title,
        body,
        tagsJson: tagsCsv.split(",").map((s) => s.trim()).filter(Boolean),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Save failed.");
      return;
    }
    setTitle(""); setBody(""); setTagsCsv(""); setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button className="btn-accent mt-4" onClick={() => setOpen(true)}>+ New article</button>
    );
  }

  return (
    <div className="card p-5 mt-4 space-y-3">
      <div>
        <label className="label">Title</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label className="label">Body (markdown ok)</label>
        <textarea className="input min-h-[160px]" value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div>
        <label className="label">Tags (comma-sep)</label>
        <input className="input" value={tagsCsv} onChange={(e) => setTagsCsv(e.target.value)} />
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <div className="flex gap-3">
        <button className="btn-primary" onClick={save} disabled={saving || !title || !body}>
          {saving ? "Saving…" : "Save article"}
        </button>
        <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}
