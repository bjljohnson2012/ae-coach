"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AvatarCropper } from "@/components/AvatarCropper";
import { prettyRole } from "@/lib/roleLabels";

interface Props {
  initial: { name: string; email: string; imageUrl: string | null };
  orgName: string;
  role: string;
  memberSince: string;
  lastLogin: string;
}

export function AccountForm({ initial, orgName, role, memberSince, lastLogin }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initial.name);
  const [imageUrl, setImageUrl] = useState(initial.imageUrl ?? "");
  const [email] = useState(initial.email);
  const [requestedEmail, setRequestedEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [emailRequesting, setEmailRequesting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [emailMsg, setEmailMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Cropper state
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropFilename, setCropFilename] = useState("");

  // imageBroken = true when the URL is set but the image failed to load
  // (e.g., upload corrupted, file deleted on server, CORS issue). We fall
  // back to the initials avatar instead of showing the cropped alt-text.
  const [imageBroken, setImageBroken] = useState(false);

  const initials = name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  function pickFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setMsg({ kind: "err", text: "That doesn't look like an image." });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setMsg({ kind: "err", text: "Image must be under 10 MB." });
      return;
    }
    setMsg(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      setCropSrc(e.target?.result as string);
      setCropFilename(file.name);
    };
    reader.readAsDataURL(file);
  }

  async function uploadCropped(blob: Blob, _dataUrl: string) {
    setUploading(true); setMsg(null);
    const fd = new FormData();
    const file = new File([blob], `avatar-${Date.now()}.png`, { type: "image/png" });
    fd.append("file", file);
    const res = await fetch("/api/files/upload", { method: "POST", body: fd });
    setUploading(false);
    setCropSrc(null);
    if (!res.ok) {
      setMsg({ kind: "err", text: "Upload failed." });
      return;
    }
    const j = await res.json();
    const url = `/api/files/raw?path=${encodeURIComponent(j.upload.storagePath)}`;
    setImageUrl(url);
    setImageBroken(false); // fresh upload — clear any prior broken state
    const patch = await fetch("/api/user/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: url }),
    });
    if (!patch.ok) {
      const err = await patch.json().catch(() => ({}));
      setMsg({ kind: "err", text: err.error || "Saved upload but couldn't update your profile. Try saving the form." });
      return;
    }
    setMsg({ kind: "ok", text: "Profile picture updated." });
    router.refresh();
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) pickFile(f);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/user/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, imageUrl: imageUrl.trim() || null }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setMsg({ kind: "err", text: j.error || "Save failed." });
      return;
    }
    setMsg({ kind: "ok", text: "Saved." });
    router.refresh();
    setTimeout(() => setMsg(null), 1800);
  }

  async function requestEmailChange() {
    if (!requestedEmail) return;
    setEmailRequesting(true); setEmailMsg(null);
    const res = await fetch("/api/user/email-change-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestedEmail }),
    });
    setEmailRequesting(false);
    if (!res.ok) {
      setEmailMsg({ kind: "err", text: (await res.json().catch(() => ({}))).error || "Failed" });
      return;
    }
    setEmailMsg({ kind: "ok", text: "Request submitted. Your company admin will approve it." });
    setRequestedEmail("");
  }

  return (
    <>
      {cropSrc && (
        <AvatarCropper
          src={cropSrc}
          filename={cropFilename}
          onCropped={uploadCropped}
          onCancel={() => setCropSrc(null)}
        />
      )}

      <form onSubmit={save} className="space-y-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex items-center gap-4 p-3 rounded-brand border-2 border-dashed transition-all cursor-pointer ${
            dragOver ? "border-brand-orange bg-brand-orange/5" : "border-transparent hover:border-ink-line"
          }`}
          onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])} />
          {imageUrl && !imageBroken ? (
            <img
              src={imageUrl}
              alt=""
              className="w-20 h-20 rounded-full object-cover ring-2 ring-ink-softLine"
              onError={() => setImageBroken(true)}
            />
          ) : (
            <div
              className="w-20 h-20 rounded-full bg-gradient-to-br from-brand-indigo to-brand-orange flex items-center justify-center text-white text-2xl font-bold"
              aria-hidden="true"
            >
              {initials}
            </div>
          )}
          <div>
            <div className="font-display text-lg font-semibold">{name}</div>
            <div className="text-xs text-ink-muted font-mono">{email}</div>
            <div className="badge-active mt-1.5">{prettyRole(role)}</div>
            <div className="meta mt-1.5">
              {uploading
                ? "Uploading…"
                : imageBroken
                  ? "Previous photo couldn't load — drop or click to upload a new one."
                  : "Drop or click — you'll position the crop next."}
            </div>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="name">Display name</label>
          <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div>
          <label className="label">Email address</label>
          <input className="input font-mono" value={email} readOnly />
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-brand-indigo">Request a new email</summary>
            <div className="mt-2 space-y-2">
              <p className="text-xs text-ink-muted">
                Email changes need approval from your {role === "COMPANY_ADMIN" ? "org admin" : "company admin"}.
              </p>
              <div className="flex gap-2">
                <input type="email" className="input flex-1 font-mono" placeholder="new@email.com"
                  value={requestedEmail} onChange={(e) => setRequestedEmail(e.target.value)} />
                <button type="button" onClick={requestEmailChange} disabled={emailRequesting || !requestedEmail} className="btn-secondary text-sm whitespace-nowrap">
                  {emailRequesting ? "Submitting…" : "Request"}
                </button>
              </div>
              {emailMsg && (
                <div className={`text-sm rounded-brand px-3 py-2 border ${emailMsg.kind === "ok" ? "text-brand-emerald bg-brand-emerald/5 border-brand-emerald/20" : "text-brand-red bg-brand-red/5 border-brand-red/20"}`}>
                  {emailMsg.text}
                </div>
              )}
            </div>
          </details>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 text-sm pt-2 border-t border-ink-softLine">
          <Field label="Org" value={orgName} />
          <Field label="Member since" value={memberSince} />
          <Field label="Last login" value={lastLogin} />
        </div>

        {msg && (
          <div className={`text-sm rounded-brand px-3 py-2 border ${msg.kind === "ok" ? "text-brand-emerald bg-brand-emerald/5 border-brand-emerald/20" : "text-brand-red bg-brand-red/5 border-brand-red/20"}`}>
            {msg.text}
          </div>
        )}

        <button type="submit" disabled={saving || !name} className="btn-primary">
          {saving ? "Saving…" : "Save profile"}
        </button>
      </form>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="mt-0.5 font-medium text-sm">{value}</div>
    </div>
  );
}
