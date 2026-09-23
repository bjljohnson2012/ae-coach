"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function InvitePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null); setInviteUrl(null);
    const res = await fetch("/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, role: "AE" }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Could not send invite.");
      return;
    }
    const j = await res.json();
    setInviteUrl(j.inviteUrl);
  }

  return (
    <div className="max-w-2xl mx-auto p-8">
      <button onClick={() => router.push("/dashboard")} className="text-sm text-neutral-500 hover:underline mb-4">← Back</button>
      <h1 className="text-2xl font-semibold mb-1">Invite an AE</h1>
      <p className="text-sm text-neutral-500 mb-6">They'll receive a link to set their password and complete the intake wizard.</p>

      <form onSubmit={onSubmit} className="card p-6 space-y-4">
        <div>
          <label className="label" htmlFor="name">Full name</label>
          <input id="name" className="input" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? "Sending…" : "Send invite"}
        </button>
      </form>

      {inviteUrl && (
        <div className="card p-6 mt-4 bg-amber-50 border-amber-200">
          <div className="text-sm font-medium mb-2">Invite created.</div>
          <p className="text-sm text-neutral-700 mb-3">
            SMTP isn't wired in v0 — copy this link and send it to the AE manually:
          </p>
          <input className="input" readOnly value={inviteUrl} onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}
    </div>
  );
}
