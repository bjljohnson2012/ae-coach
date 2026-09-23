"use client";
import { useState } from "react";

export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next1, setNext1] = useState("");
  const [next2, setNext2] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next1 !== next2) {
      setMsg({ kind: "err", text: "New passwords don't match." });
      return;
    }
    if (next1.length < 8) {
      setMsg({ kind: "err", text: "New password must be at least 8 characters." });
      return;
    }
    setSaving(true);
    const res = await fetch("/api/user/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next1 }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setMsg({ kind: "err", text: j.error || "Password change failed." });
      return;
    }
    setMsg({ kind: "ok", text: "Password changed. A confirmation email was sent (or logged in v0)." });
    setCurrent(""); setNext1(""); setNext2("");
  }

  return (
    <form onSubmit={save} className="space-y-3 max-w-md">
      <p className="text-sm text-ink-muted">
        For your security we'll email you a confirmation when you change your password.
      </p>
      <div>
        <label className="label">Current password</label>
        <input type="password" className="input" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      </div>
      <div>
        <label className="label">New password</label>
        <input type="password" className="input" value={next1} onChange={(e) => setNext1(e.target.value)} autoComplete="new-password" />
      </div>
      <div>
        <label className="label">Confirm new password</label>
        <input type="password" className="input" value={next2} onChange={(e) => setNext2(e.target.value)} autoComplete="new-password" />
      </div>
      {msg && (
        <div className={`text-sm rounded-brand px-3 py-2 border ${msg.kind === "ok" ? "text-brand-emerald bg-brand-emerald/5 border-brand-emerald/20" : "text-brand-red bg-brand-red/5 border-brand-red/20"}`}>
          {msg.text}
        </div>
      )}
      <button type="submit" disabled={saving || !current || !next1} className="btn-primary">
        {saving ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}
