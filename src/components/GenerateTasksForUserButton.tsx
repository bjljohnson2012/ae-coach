"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ManageableUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface DraftTask {
  title: string;
  description: string;
  urgency: "URGENT" | "HIGH" | "MEDIUM" | "LOW";
  category: string;
  dueInDays: number;
  rationale: string;
  selected: boolean;
}

const URGENCY_COLOR: Record<string, string> = {
  URGENT: "bg-brand-red/10 text-brand-red",
  HIGH: "bg-brand-orange/10 text-brand-orange",
  MEDIUM: "bg-brand-indigo/10 text-brand-indigo",
  LOW: "bg-ink-softLine text-ink-slate",
};

const ROLE_LABEL: Record<string, string> = {
  ORG_ADMIN: "Super Admin",
  COMPANY_ADMIN: "Company Admin",
  VP_SALES: "VP",
  DIRECTOR: "Director",
  AE: "AE",
};

/**
 * "For User" task generation. Generic — pick any manageable user (yourself or
 * anyone at lower-or-equal permission). AI generates next-best-action tasks
 * tailored to whichever profile they have (or generic if no profile).
 *
 * Variants:
 *  - default: full button, opens modal with picker
 *  - compact: small button (for inline placement on a profile, defaults to that user)
 */
export function GenerateTasksForUserButton({
  preselectedUserId,
  buttonLabel = "✨ For User",
  buttonClassName = "btn-secondary text-sm",
}: {
  preselectedUserId?: string;
  buttonLabel?: string;
  buttonClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<ManageableUser[]>([]);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(preselectedUserId ?? null);
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<DraftTask[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasProfile, setHasProfile] = useState<boolean>(true);

  useEffect(() => {
    if (!open) return;
    fetch("/api/users/manageable").then(async (r) => {
      if (r.ok) {
        const j = await r.json();
        setUsers(j.users ?? []);
        setSelfId(j.selfId ?? null);
        if (!selectedUserId && (preselectedUserId || j.selfId)) {
          setSelectedUserId(preselectedUserId ?? j.selfId);
        }
      }
    });
  }, [open]);

  function close() {
    setOpen(false);
    setDrafts([]);
    setError(null);
    setBusy(false);
    setSaving(false);
    setPickerQuery("");
  }

  async function generate() {
    if (!selectedUserId) { setError("Pick a user first."); return; }
    setBusy(true); setError(null);
    const res = await fetch(`/api/users/${selectedUserId}/generate-tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Failed to generate.");
      return;
    }
    const j = await res.json();
    setHasProfile(j.hasProfile);
    setDrafts((j.draft ?? []).map((d: any) => ({ ...d, selected: true })));
  }

  async function saveSelected() {
    const toSave = drafts.filter((d) => d.selected);
    if (toSave.length === 0 || !selectedUserId) return;
    setSaving(true);
    let saved = 0;
    for (const d of toSave) {
      const dueAt = new Date(Date.now() + (d.dueInDays || 0) * 24 * 3600 * 1000).toISOString();
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assigneeUserId: selectedUserId,
          title: d.title,
          description: d.description,
          dueAt,
        }),
      });
      if (res.ok) saved++;
    }
    setSaving(false);
    close();
    router.refresh();
    setTimeout(() => alert(`Saved ${saved} of ${toSave.length} tasks.`), 0);
  }

  function toggle(i: number) {
    setDrafts((arr) => arr.map((d, idx) => idx === i ? { ...d, selected: !d.selected } : d));
  }

  const selectedUser = users.find((u) => u.id === selectedUserId);
  const filteredUsers = pickerQuery.trim()
    ? users.filter((u) => u.name.toLowerCase().includes(pickerQuery.toLowerCase()) || u.email.toLowerCase().includes(pickerQuery.toLowerCase()))
    : users;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClassName}>
        {buttonLabel}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-brand-navy/60 z-30" onClick={close} />
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-none overflow-y-auto">
            <div className="card max-w-2xl w-full p-6 my-6 pointer-events-auto animate-slideUp max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h2 className="h-section">Generate tasks for user</h2>
                <button onClick={close} className="text-ink-muted hover:text-ink">✕</button>
              </div>

              {drafts.length === 0 ? (
                <div className="space-y-4">
                  {/* User picker */}
                  <div>
                    <label className="label">For user</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Search by name or email…"
                      value={pickerQuery}
                      onChange={(e) => setPickerQuery(e.target.value)}
                    />
                    <div className="meta mt-1">
                      Showing users at or below your permission level ({users.length} available).
                    </div>
                    <div className="mt-2 max-h-64 overflow-y-auto border border-ink-softLine rounded-brand divide-y divide-ink-softLine">
                      {filteredUsers.length === 0 ? (
                        <div className="px-3 py-4 text-center text-sm text-ink-muted">No matches.</div>
                      ) : (
                        filteredUsers.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => setSelectedUserId(u.id)}
                            className={`w-full px-3 py-2 flex items-center gap-3 text-left text-sm transition-colors ${
                              selectedUserId === u.id ? "bg-brand-indigo/10" : "hover:bg-surface-soft"
                            }`}
                          >
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-indigo to-brand-orange flex items-center justify-center text-white text-xs font-bold shrink-0">
                              {u.name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("")}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">
                                {u.name}
                                {u.id === selfId && <span className="ml-2 text-xs font-normal text-brand-orange">(you)</span>}
                              </div>
                              <div className="meta truncate">{u.email}</div>
                            </div>
                            <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-ink-softLine text-ink-slate shrink-0">
                              {ROLE_LABEL[u.role] ?? u.role}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="label">How many tasks?</label>
                    <div className="flex items-center gap-3">
                      <input type="range" min={1} max={10} value={count} onChange={(e) => setCount(Number(e.target.value))} className="flex-1" />
                      <span className="font-mono w-8 text-right">{count}</span>
                    </div>
                  </div>

                  {error && <div className="text-sm text-brand-red">{error}</div>}

                  <div className="flex justify-end gap-2 pt-2">
                    <button onClick={close} className="btn-ghost">Cancel</button>
                    <button onClick={generate} disabled={busy || !selectedUserId} className="btn-primary">
                      {busy ? "Generating…" : `Generate ${count} for ${selectedUser?.name.split(" ")[0] ?? "user"}`}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {!hasProfile && (
                    <div className="text-xs bg-brand-amber/5 border border-brand-amber/30 rounded-brand p-2">
                      {selectedUser?.name} doesn't have a synthesized profile yet. Tasks are generic — they'll be sharper once intake is complete.
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <span className="font-mono font-bold">{drafts.filter((d) => d.selected).length}</span>
                      <span className="text-ink-muted"> / {drafts.length} selected for {selectedUser?.name}</span>
                    </div>
                    <button onClick={() => setDrafts((arr) => arr.map((d) => ({ ...d, selected: !d.selected })))} className="text-xs link">
                      Toggle all
                    </button>
                  </div>
                  <ul className="divide-y divide-ink-softLine border border-ink-softLine rounded-brand max-h-[55vh] overflow-y-auto">
                    {drafts.map((d, i) => (
                      <li key={i} className="px-3 py-3 flex items-start gap-3">
                        <input type="checkbox" checked={d.selected} onChange={() => toggle(i)} className="mt-1" />
                        <div className="flex-1 text-sm">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{d.title}</span>
                            <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${URGENCY_COLOR[d.urgency]}`}>
                              {d.urgency}
                            </span>
                            <span className="meta">due in {d.dueInDays}d · {d.category.replace(/_/g, " ").toLowerCase()}</span>
                          </div>
                          <p className="text-ink-slate mt-1">{d.description}</p>
                          {d.rationale && <p className="meta italic mt-1">{d.rationale}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="flex justify-between pt-2">
                    <button onClick={() => setDrafts([])} className="btn-ghost">← Regenerate</button>
                    <div className="flex gap-2">
                      <button onClick={close} className="btn-ghost">Cancel</button>
                      <button
                        onClick={saveSelected}
                        disabled={saving || drafts.filter((d) => d.selected).length === 0}
                        className="btn-primary"
                      >
                        {saving ? "Saving…" : `Save ${drafts.filter((d) => d.selected).length} task${drafts.filter((d) => d.selected).length === 1 ? "" : "s"}`}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
