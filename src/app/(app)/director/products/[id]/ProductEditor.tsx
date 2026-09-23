"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProductEditor({
  product,
}: {
  product: { id: string; name: string; summary: string | null; audience: string | null; active: boolean };
}) {
  const router = useRouter();
  const [name, setName] = useState(product.name);
  const [summary, setSummary] = useState(product.summary ?? "");
  const [audience, setAudience] = useState(product.audience ?? "");
  const [active, setActive] = useState(product.active);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/products/${product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, summary, audience, active }),
    });
    setSaving(false);
    setMsg(res.ok ? "Saved." : "Failed.");
    if (res.ok) { router.refresh(); setTimeout(() => setMsg(null), 1800); }
  }

  async function softDelete() {
    if (!confirm("Mark this product inactive?")) return;
    setSaving(true);
    const res = await fetch(`/api/products/${product.id}`, { method: "DELETE" });
    setSaving(false);
    if (res.ok) router.push("/director/products");
  }

  return (
    <section className="card p-5 space-y-3">
      <div className="eyebrow">Edit product</div>
      <div>
        <label className="label">Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="label">Summary</label>
        <textarea className="input min-h-[100px]" value={summary} onChange={(e) => setSummary(e.target.value)} />
      </div>
      <div>
        <label className="label">Audience</label>
        <input className="input" value={audience} onChange={(e) => setAudience(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Active
      </label>
      {msg && <div className="text-sm text-ink-slate">{msg}</div>}
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="btn-primary">{saving ? "…" : "Save"}</button>
        <button onClick={softDelete} disabled={saving} className="btn-ghost text-brand-red text-xs">Delete</button>
      </div>
    </section>
  );
}
