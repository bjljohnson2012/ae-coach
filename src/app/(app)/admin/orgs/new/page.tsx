"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewOrgPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [brandColor, setBrandColor] = useState("#1F3C88");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function autoSlug(v: string) {
    setName(v);
    if (!slug) setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  }

  async function save() {
    setSaving(true); setError(null);
    const res = await fetch("/api/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug, brandColor }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Save failed.");
      return;
    }
    router.push("/admin/orgs");
    router.refresh();
  }

  return (
    <div className="page max-w-2xl">
      <Link href="/admin/orgs" className="link text-sm">← All orgs</Link>
      <h1 className="h-page mt-2">New Organization</h1>
      <div className="card p-5 mt-4 space-y-3">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => autoSlug(e.target.value)} />
        </div>
        <div>
          <label className="label">Slug</label>
          <input className="input font-mono" value={slug} onChange={(e) => setSlug(e.target.value)} />
        </div>
        <div>
          <label className="label">Brand color</label>
          <div className="flex items-center gap-3">
            <input type="color" className="w-12 h-10 rounded-brand border border-ink-line" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} />
            <input className="input font-mono" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} />
          </div>
        </div>
        {error && <div className="text-sm text-brand-red bg-brand-red/5 border border-brand-red/20 rounded-brand px-3 py-2">{error}</div>}
        <div className="flex gap-2 pt-2">
          <button onClick={save} disabled={saving || !name || !slug} className="btn-primary">{saving ? "Creating…" : "Create org"}</button>
          <button onClick={() => router.push("/admin/orgs")} className="btn-ghost">Cancel</button>
        </div>
      </div>
    </div>
  );
}
