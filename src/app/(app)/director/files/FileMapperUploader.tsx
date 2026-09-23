"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { UserSearch } from "@/components/UserSearch";

const KINDS = ["AE_PREP_DOC", "COACHING_DOC", "PROFILE_ASSET", "PRODUCT_REFERENCE", "PERSONALITY_NOTE", "GENERAL", "OTHER"];
const INTENTS = ["ADD_TO_COACHING_LOG", "UPDATE_PROFILE", "REFERENCE_ONLY"];
const VIS = ["DIRECTOR_ONLY", "AE_ONLY", "BOTH"];
const ACCEPT = ".txt,.md,.html,.csv,.docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/*";

interface UploadResult {
  upload: {
    filename: string;
    mimeType: string;
    sizeBytes: number;
    storagePath: string;
    textPreview: string;
  };
  suggestion: any | null;
}

export function FileMapperUploader({ aes }: { aes: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState<UploadResult | null>(null);

  const [kind, setKind] = useState("COACHING_DOC");
  const [aeProfileId, setAeProfileId] = useState("");
  const [intent, setIntent] = useState("ADD_TO_COACHING_LOG");
  const [visibility, setVisibility] = useState("DIRECTOR_ONLY");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadFile(file: File) {
    setUploading(true); setError(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/files/upload", { method: "POST", body: fd });
    setUploading(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Upload failed.");
      return;
    }
    const j = (await res.json()) as UploadResult;
    setPending(j);
    if (j.suggestion?.kind) setKind(j.suggestion.kind);
    if (j.suggestion?.aeProfileId) setAeProfileId(j.suggestion.aeProfileId);
    if (j.suggestion?.updateIntent) setIntent(j.suggestion.updateIntent);
    if (j.suggestion?.visibility) setVisibility(j.suggestion.visibility);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  async function confirmSave() {
    if (!pending) return;
    setSaving(true); setError(null);
    const res = await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: pending.upload.filename,
        mimeType: pending.upload.mimeType,
        sizeBytes: pending.upload.sizeBytes,
        storagePath: pending.upload.storagePath,
        kind,
        aeProfileId: aeProfileId || undefined,
        updateIntent: intent,
        visibility,
        textContent: pending.upload.textPreview,
        ...(pending.suggestion ? {
          aiSuggestedKind: pending.suggestion.kind,
          aiSuggestedAeProfileId: pending.suggestion.aeProfileId,
          aiSuggestedIntent: pending.suggestion.updateIntent,
          aiConfidence: pending.suggestion.confidence,
          aiRationale: pending.suggestion.rationale,
        } : {}),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Save failed.");
      return;
    }
    setPending(null);
    router.refresh();
  }

  if (pending) {
    return (
      <div className="card p-5 space-y-3 animate-slideUp">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📄</span>
          <div className="flex-1">
            <div className="font-display font-semibold">{pending.upload.filename}</div>
            <div className="meta">
              {(pending.upload.sizeBytes / 1024).toFixed(1)} KB · {pending.upload.mimeType || "unknown"}
              {pending.upload.textPreview ? ` · ${pending.upload.textPreview.length} chars extracted` : ""}
            </div>
          </div>
        </div>

        {pending.suggestion && (
          <div className="border border-brand-amber/40 bg-brand-amber/10 rounded-brand p-3 text-xs">
            <strong>AI suggestion ({Math.round((pending.suggestion.confidence ?? 0) * 100)}%):</strong>{" "}
            {pending.suggestion.rationale}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Kind</label>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map((k) => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div>
            <label className="label">AE</label>
            <UserSearch
              options={aes.map((a) => ({ id: a.id, name: a.name }))}
              value={aeProfileId}
              onChange={setAeProfileId}
              placeholder="Search by name…"
              allowEmpty
            />
          </div>
          <div>
            <label className="label">Intent</label>
            <select className="input" value={intent} onChange={(e) => setIntent(e.target.value)}>
              {INTENTS.map((i) => <option key={i} value={i}>{i.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Visibility</label>
            <select className="input" value={visibility} onChange={(e) => setVisibility(e.target.value)}>
              {VIS.map((v) => <option key={v} value={v}>{v.replace(/_/g, " ")}</option>)}
            </select>
          </div>
        </div>

        {error && <div className="text-sm text-brand-red bg-brand-red/5 border border-brand-red/20 rounded-brand px-3 py-2">{error}</div>}

        <div className="flex gap-2 pt-2">
          <button onClick={confirmSave} disabled={saving} className="btn-primary">
            {saving ? "Saving…" : "Confirm & Save"}
          </button>
          <button onClick={() => setPending(null)} className="btn-ghost">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => fileRef.current?.click()}
      className={`card p-10 text-center cursor-pointer transition-all duration-200 ease-brand
        ${dragOver
          ? "border-brand-orange bg-brand-orange/5 shadow-orangeGlow"
          : "border-dashed hover:border-brand-indigo/40 hover:shadow-cardHover"}`}
    >
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
      />
      <div className="text-3xl mb-2">{uploading ? "⏳" : dragOver ? "⬇️" : "📤"}</div>
      <div className="font-display text-lg font-semibold mb-1">
        {uploading ? "Uploading & extracting…" : "Drop a file here"}
      </div>
      <p className="text-sm text-ink-muted">
        Or click to browse. PDF, DOCX, TXT, MD, HTML — up to 50 MB.
      </p>
      <p className="meta mt-3">
        AI will auto-classify (kind, target AE, intent). You confirm before save.
      </p>
    </div>
  );
}
