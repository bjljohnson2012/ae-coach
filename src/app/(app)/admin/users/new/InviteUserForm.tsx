"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const ROLES = [
  { value: "AE", label: "AE — Account Executive" },
  { value: "DIRECTOR", label: "Director — manages AEs" },
  { value: "VP_SALES", label: "VP — manages Directors" },
  { value: "COMPANY_ADMIN", label: "Company Admin — full access in org" },
] as const;

interface Props {
  canPickOrg: boolean;
  orgs: Array<{ id: string; name: string }>;
  vps: Array<{ id: string; name: string; orgId: string }>;
  directors: Array<{ id: string; name: string; orgId: string }>;
  // Pre-fill the org if the admin came from a specific company's edit page.
  presetOrgId?: string;
}

interface SuccessState {
  userName: string;
  userEmail: string;
  inviteUrl: string;
  emailDelivered: boolean;   // true when SMTP actually sent; false when console-fallback
}

export function InviteUserForm({ canPickOrg, orgs, vps, directors, presetOrgId }: Props) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<typeof ROLES[number]["value"]>("AE");
  const [orgId, setOrgId] = useState(presetOrgId ?? orgs[0]?.id ?? "");
  const [vpId, setVpId] = useState("");
  const [directorId, setDirectorId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [countdown, setCountdown] = useState(3);

  // Auto-redirect after a successful SMTP send so the admin doesn't have to click.
  useEffect(() => {
    if (!success) return;
    if (!success.emailDelivered) return; // console-fallback: stay on screen so admin can copy link
    if (countdown <= 0) {
      router.push(canPickOrg && orgId ? `/admin/users?orgId=${orgId}` : "/admin/users");
      router.refresh();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [success, countdown, router, canPickOrg, orgId]);

  async function save() {
    setSaving(true); setError(null); setSuccess(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName, lastName, email, role,
        orgId: canPickOrg ? orgId : undefined,
        vpId: role === "DIRECTOR" ? (vpId || null) : undefined,
        directorId: role === "AE" ? (directorId || null) : undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Invite failed.");
      return;
    }
    const j = await res.json();
    setSuccess({
      userName: `${firstName} ${lastName}`.trim(),
      userEmail: email,
      inviteUrl: j.inviteUrl,
      emailDelivered: j.sentVia === "smtp",
    });
    setCountdown(3);
  }

  // Success state — replaces the form so the admin gets a clear "done" view.
  if (success) {
    return (
      <div className="card p-6 space-y-4 animate-slideUp">
        {success.emailDelivered ? (
          <>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-emerald/10 flex items-center justify-center text-brand-emerald text-xl">✓</div>
              <div>
                <h2 className="h-section">Invite sent</h2>
                <p className="text-sm text-ink-muted">
                  Welcome email delivered to <strong>{success.userEmail}</strong>.
                </p>
              </div>
            </div>
            <div className="bg-brand-emerald/5 border border-brand-emerald/20 rounded-brand p-4 text-sm space-y-1">
              <div><strong>{success.userName}</strong> can now click the link in their email to set a password.</div>
              <div className="text-xs text-ink-muted">The link expires in 5 days. If they miss it, you can resend from the user's edit page.</div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">Redirecting in {countdown}…</span>
              <div className="flex gap-2">
                <button onClick={() => { setSuccess(null); setFirstName(""); setLastName(""); setEmail(""); }} className="btn-ghost text-sm">
                  Invite another
                </button>
                <button onClick={() => router.push(canPickOrg && orgId ? `/admin/users?orgId=${orgId}` : "/admin/users")} className="btn-primary text-sm">
                  Done
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-amber/10 flex items-center justify-center text-brand-amber text-xl">!</div>
              <div>
                <h2 className="h-section">Invite created — no email sent</h2>
                <p className="text-sm text-ink-muted">SMTP isn't configured. Copy this link and send it manually.</p>
              </div>
            </div>
            <div className="border border-brand-amber/40 bg-brand-amber/10 rounded-brand p-3 text-sm space-y-2">
              <div className="font-semibold">{success.userName} ({success.userEmail})</div>
              <input
                className="input font-mono text-xs"
                readOnly
                value={success.inviteUrl}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                onClick={() => navigator.clipboard.writeText(success.inviteUrl)}
                className="btn-secondary text-xs"
              >
                📋 Copy link
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setSuccess(null); setFirstName(""); setLastName(""); setEmail(""); }} className="btn-ghost text-sm">
                Invite another
              </button>
              <button onClick={() => router.push(canPickOrg && orgId ? `/admin/users?orgId=${orgId}` : "/admin/users")} className="btn-primary text-sm">
                Done
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="card p-5 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">First name</label>
          <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div>
          <label className="label">Last name</label>
          <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label">Email</label>
        <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label">User type</label>
        <select className="input" value={role} onChange={(e) => setRole(e.target.value as any)}>
          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>
      {canPickOrg && (
        <div>
          <label className="label">Org</label>
          <select className="input" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      )}
      {role === "DIRECTOR" && (
        <div>
          <label className="label">Reports to (VP) — optional</label>
          <select className="input" value={vpId} onChange={(e) => setVpId(e.target.value)}>
            <option value="">— none —</option>
            {vps.filter((v) => !canPickOrg || v.orgId === orgId).map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>
      )}
      {role === "AE" && (
        <div>
          <label className="label">Reports to (Director) — optional</label>
          <select className="input" value={directorId} onChange={(e) => setDirectorId(e.target.value)}>
            <option value="">— none —</option>
            {directors.filter((d) => !canPickOrg || d.orgId === orgId).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      )}
      {error && <div className="text-sm text-brand-red bg-brand-red/5 border border-brand-red/20 rounded-brand px-3 py-2">{error}</div>}
      <div className="flex gap-2 pt-2">
        <button onClick={save} disabled={saving || !firstName || !lastName || !email} className="btn-primary">
          {saving ? "Sending invite…" : "Send invite"}
        </button>
        <button onClick={() => router.push("/admin/users")} className="btn-ghost">Cancel</button>
      </div>
    </div>
  );
}
