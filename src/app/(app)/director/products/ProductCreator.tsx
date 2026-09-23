"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export function ProductCreator() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [audience, setAudience] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true); setError(null);
    const slug = slugify(name);
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug, summary, audience }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Save failed.");
      return;
    }
    setName(""); setSummary(""); setAudience(""); setOpen(false);
    router.refresh();
  }

  if (!open) {
    return <button className="btn-primary" onClick={() => setOpen(true)}>+ New product</button>;
  }
  return (
    <div className="card p-5 space-y-3 mt-2">
      <div>
        <label className="label">Product name</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Acme Procurement Suite"
        />
        {name && <div className="meta mt-1.5">Slug will be: <span className="font-mono">{slugify(name) || "—"}</span></div>}
      </div>
      <div>
        <label className="label">Short summary</label>
        <textarea className="input min-h-[80px]" value={summary} onChange={(e) => setSummary(e.target.value)} />
      </div>
      <div>
        <label className="label">Audience</label>
        <input className="input" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Counties, school districts, mid-market…" />
      </div>
      {error && <div className="text-sm text-brand-red bg-brand-red/5 border border-brand-red/20 rounded-brand px-3 py-2">{error}</div>}
      <div className="flex gap-3 pt-1">
        <button className="btn-primary" onClick={save} disabled={saving || !name || !slugify(name)}>
          {saving ? "Saving…" : "Create product"}
        </button>
        <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}
