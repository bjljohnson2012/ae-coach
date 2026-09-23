"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const ROLES = ["ORG_ADMIN", "COMPANY_ADMIN", "VP_SALES", "DIRECTOR", "AE"];

interface Props {
  user: {
    id: string; name: string; email: string;
    role: string; status: string;
    vpId: string | null; imageUrl: string | null;
  };
  vps: Array<{ id: string; name: string }>;
  actorRole: string;
}

export function EditUserForm({ user, vps, actorRole }: Props) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState(user.role);
  const [status, setStatus] = useState(user.status);
  const [vpId, setVpId] = useState(user.vpId ?? "");
  const [imageUrl, setImageUrl] = useState(user.imageUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const availableRoles = actorRole === "ORG_ADMIN" ? ROLES : ROLES.filter((r) => r !== "ORG_ADMIN");

  async function save() {
    setSaving(true); setMsg(null);
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, role, status,
        vpId: role === "DIRECTOR" ? (vpId || null) : null,
        imageUrl: imageUrl || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setMsg({ kind: "err", text: (await res.json().catch(() => ({}))).error || "Save failed." });
      return;
    }
    setMsg({ kind: "ok", text: "Saved." });
    router.refresh();
  }

  async function deactivate() {
    if (!confirm("Deactivate this user? They won't be able to log in.")) return;
    setSaving(true);
    const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) {
      setMsg({ kind: "err", text: (await res.json().catch(() => ({}))).error || "Failed." });
      return;
    }
    router.push("/admin/users");
    router.refresh();
  }

  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [resetVia, setResetVia] = useState<string | null>(null);

  async function resetPassword() {
    if (!confirm(`Send a password reset link to ${user.email}?`)) return;
    setSaving(true); setMsg(null); setResetUrl(null);
    const res = await fetch(`/api/admin/users/${user.id}/reset-password`, { method: "POST" });
    setSaving(false);
    if (!res.ok) {
      setMsg({ kind: "err", text: (await res.json().catch(() => ({}))).error || "Reset failed." });
      return;
    }
    const j = await res.json();
    setResetUrl(j.inviteUrl);
    setResetVia(j.sentVia);
    setMsg({
      kind: "ok",
      text: j.sentVia === "smtp"
        ? `Reset email sent to ${user.email}. Expires in ${j.expiresInMinutes} min.`
        : `Reset link generated (SMTP not wired). Copy it below — expires in ${j.expiresInMinutes} min.`,
    });
  }

  return (
    <div className="card p-5 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
            {availableRoles.map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ACTIVE">Active</option>
            <option value="PENDING">Pending</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
        {role === "DIRECTOR" && (
          <div>
            <label className="label">Reports to (VP)</label>
            <select className="input" value={vpId} onChange={(e) => setVpId(e.target.value)}>
              <option value="">— none —</option>
              {vps.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
        )}
      </div>
      <div>
        <label className="label">Profile picture URL</label>
        <input type="url" className="input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
      </div>
      {msg && (
        <div className={`text-sm rounded-brand px-3 py-2 border ${msg.kind === "ok" ? "text-brand-emerald bg-brand-emerald/5 border-brand-emerald/20" : "text-brand-red bg-brand-red/5 border-brand-red/20"}`}>
          {msg.text}
        </div>
      )}
      <div className="flex gap-2 pt-2 flex-wrap">
        <button onClick={save} disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save changes"}</button>
        {actorRole !== "VP_SALES" && (
          <>
            <button onClick={resetPassword} disabled={saving} className="btn-secondary text-sm">Send password reset</button>
            <button onClick={deactivate} disabled={saving} className="btn-ghost text-brand-red text-sm">Deactivate user</button>
          </>
        )}
      </div>
      {resetUrl && (
        <div className="border border-brand-amber/40 bg-brand-amber/10 rounded-brand p-3 text-xs space-y-1.5 mt-2">
          <div className="font-semibold">Reset link {resetVia === "smtp" ? "(emailed; copy below as backup)" : "(SMTP not wired — send manually)"}</div>
          <input className="input font-mono text-xs" readOnly value={resetUrl} onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}
    </div>
  );
}
