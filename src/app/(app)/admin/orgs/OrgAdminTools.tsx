"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface U { id: string; name: string; email: string; role: string; orgId: string; orgName: string; }
interface O { id: string; name: string; }

export function OrgAdminTools({ users, orgs }: { users: U[]; orgs: O[] }) {
  const router = useRouter();
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const [newOrgId, setNewOrgId] = useState(orgs[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const selected = users.find((u) => u.id === userId);

  async function move() {
    setSaving(true); setError(null); setOk(false);
    const res = await fetch("/api/admin/move-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, newOrgId }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Move failed.");
      return;
    }
    setOk(true);
    router.refresh();
  }

  return (
    <div className="card p-5 space-y-3">
      <h2 className="text-sm font-medium">Move user to another org</h2>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">User</label>
          <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.role} · {u.orgName}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Target org</label>
          <select className="input" value={newOrgId} onChange={(e) => setNewOrgId(e.target.value)}>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      </div>
      {selected && selected.orgId === newOrgId && (
        <div className="text-xs text-neutral-500">User is already in this org.</div>
      )}
      {error && <div className="text-sm text-red-600">{error}</div>}
      {ok && <div className="text-sm text-green-700">Moved.</div>}
      <button className="btn-primary" disabled={saving || !selected || selected.orgId === newOrgId} onClick={move}>
        {saving ? "Moving…" : "Move user"}
      </button>
    </div>
  );
}
