"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewRepoButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("CUSTOM");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("BOTH");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true); setError(null);
    const res = await fetch("/api/knowledge/repos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kind, description, visibility }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Save failed.");
      return;
    }
    setOpen(false); setName(""); setDescription("");
    router.refresh();
  }

  if (!open) return <button onClick={() => setOpen(true)} className="btn-primary">+ New Repository</button>;

  return (
    <>
      <div className="fixed inset-0 bg-brand-navy/40 z-30" onClick={() => setOpen(false)} />
      <div className="fixed inset-0 z-40 flex items-start justify-center p-6 pointer-events-none">
        <div className="card w-full max-w-md p-6 pointer-events-auto animate-slideUp mt-20">
          <h2 className="h-section mb-1">New Repository</h2>
          <p className="text-sm text-ink-muted mb-4">Custom libraries can be anything — competitor intel, customer stories, onboarding decks.</p>
          <div className="space-y-3">
            <div>
              <label className="label">Name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Competitive Intel" />
            </div>
            <div>
              <label className="label">Kind</label>
              <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="CUSTOM">Custom</option>
                <option value="PRODUCT">Product</option>
                <option value="SALES_SKILL">Sales Skill</option>
                <option value="PERSONALITY">Personality (director-only)</option>
                <option value="LEADERSHIP">Leadership</option>
              </select>
            </div>
            <div>
              <label className="label">Description (optional)</label>
              <textarea className="input min-h-[60px]" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <label className="label">Visibility</label>
              <select className="input" value={visibility} onChange={(e) => setVisibility(e.target.value)}>
                <option value="BOTH">Both (AE + Director)</option>
                <option value="DIRECTOR_ONLY">Director only</option>
                <option value="AE_ONLY">AE only</option>
              </select>
            </div>
            {error && <div className="text-sm text-brand-red bg-brand-red/5 border border-brand-red/20 rounded-brand px-3 py-2">{error}</div>}
            <div className="flex gap-2 pt-2">
              <button onClick={save} disabled={saving || !name} className="btn-primary">
                {saving ? "Creating…" : "Create"}
              </button>
              <button onClick={() => setOpen(false)} className="btn-ghost">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
