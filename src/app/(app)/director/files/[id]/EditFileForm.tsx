"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserSearch } from "@/components/UserSearch";

const KINDS = ["AE_PREP_DOC", "COACHING_DOC", "PROFILE_ASSET", "PRODUCT_REFERENCE", "PERSONALITY_NOTE", "GENERAL", "OTHER"];
const VIS = ["DIRECTOR_ONLY", "AE_ONLY", "BOTH"];

export function EditFileForm({
  file,
  aes,
}: {
  file: { id: string; filename: string; kind: string; visibility: string; aeProfileId: string | null };
  aes: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [filename, setFilename] = useState(file.filename);
  const [kind, setKind] = useState(file.kind);
  const [visibility, setVisibility] = useState(file.visibility);
  const [aeProfileId, setAeProfileId] = useState(file.aeProfileId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true); setError(null);
    const res = await fetch(`/api/files/${file.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename,
        kind,
        visibility,
        aeProfileId: aeProfileId || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Save failed.");
      return;
    }
    router.push("/director/files");
    router.refresh();
  }

  async function softDelete() {
    if (!confirm("Delete this file? It will be removed from disk.")) return;
    setSaving(true);
    const res = await fetch(`/api/files/${file.id}`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) return;
    router.push("/director/files");
    router.refresh();
  }

  return (
    <div className="card p-5 mt-4 space-y-3">
      <div>
        <label className="label">Filename</label>
        <input className="input" value={filename} onChange={(e) => setFilename(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Kind</label>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((k) => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Visibility</label>
          <select className="input" value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            {VIS.map((v) => <option key={v} value={v}>{v.replace(/_/g, " ")}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Linked AE</label>
        <UserSearch
          options={aes}
          value={aeProfileId}
          onChange={setAeProfileId}
          placeholder="Search by name (or leave blank to unlink)…"
          allowEmpty
        />
      </div>
      {error && <div className="text-sm text-brand-red bg-brand-red/5 border border-brand-red/20 rounded-brand px-3 py-2">{error}</div>}
      <div className="flex gap-2 pt-2">
        <button onClick={save} disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save changes"}</button>
        <button onClick={softDelete} disabled={saving} className="btn-ghost text-brand-red">Delete file</button>
      </div>
    </div>
  );
}
