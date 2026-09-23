"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  orgId: string;
  orgName: string;
  status: "ACTIVE" | "INACTIVE" | "OFFBOARDED";
  isPlatform: boolean;
  // Counts shown in the warning modal so the admin understands the blast radius
  // before they confirm. Pulled at page-render time, not real-time, but close enough.
  userCount: number;
  aeCount: number;
}

type Modal = null | "deactivate" | "reactivate" | "offboard";

export function OrgLifecyclePanel({ orgId, orgName, status, isPlatform, userCount, aeCount }: Props) {
  const router = useRouter();
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [confirmName, setConfirmName] = useState("");

  // Platform org gets nothing — it can't be touched.
  if (isPlatform) {
    return (
      <section className="mt-10 card p-5 bg-surface-soft">
        <h2 className="h-section">Lifecycle</h2>
        <p className="text-sm text-ink-muted mt-2">
          The platform org cannot be deactivated or offboarded. It owns the super admin login.
        </p>
      </section>
    );
  }

  function exportData() {
    // Trigger a same-tab navigation to the export endpoint. The browser will
    // download because the response sets Content-Disposition: attachment.
    window.location.href = `/api/admin/orgs/${orgId}/export`;
  }

  async function callLifecycle(action: "deactivate" | "reactivate" | "offboard") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/orgs/${orgId}/lifecycle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason: reason || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Action failed.");
      return;
    }
    setModal(null);
    setReason("");
    setConfirmName("");
    router.refresh();
  }

  return (
    <section className="mt-10">
      <header className="mb-3">
        <div className="eyebrow text-brand-red">Danger zone</div>
        <h2 className="h-section">Lifecycle &amp; Data</h2>
        <p className="text-sm text-ink-muted">
          Pause, offboard, or back up this customer's data. Offboarding is reversible
          via reactivation but disables every login in the org until reactivated.
        </p>
      </header>

      <div className="card border-brand-red/30 overflow-hidden">
        <div className="p-5 flex flex-wrap items-center justify-between gap-3 border-b border-ink-softLine">
          <div>
            <div className="text-sm font-semibold">Current status</div>
            <div className="mt-1">
              {status === "ACTIVE" && <span className="badge-success">Active</span>}
              {status === "INACTIVE" && <span className="badge-warning">Inactive (paused)</span>}
              {status === "OFFBOARDED" && <span className="badge-neutral">Offboarded</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={exportData} className="btn-secondary text-sm">⬇ Export data (JSON)</button>
            {status === "ACTIVE" && (
              <button onClick={() => setModal("deactivate")} className="btn-ghost text-sm border border-brand-amber/40 text-brand-amber">
                Pause (mark inactive)
              </button>
            )}
            {status === "INACTIVE" && (
              <button onClick={() => setModal("reactivate")} className="btn-secondary text-sm">
                ↻ Reactivate
              </button>
            )}
            {status !== "OFFBOARDED" && (
              <button onClick={() => setModal("offboard")} className="btn-ghost text-sm border border-brand-red/40 text-brand-red">
                Offboard customer
              </button>
            )}
            {status === "OFFBOARDED" && (
              <button onClick={() => setModal("reactivate")} className="btn-secondary text-sm">
                ↻ Re-onboard
              </button>
            )}
          </div>
        </div>
        <div className="px-5 py-3 text-xs text-ink-muted bg-surface-soft">
          <div className="grid sm:grid-cols-3 gap-3">
            <div><strong>{userCount}</strong> users in this org</div>
            <div><strong>{aeCount}</strong> AE profiles</div>
            <div>Pause is reversible · Offboard disables every login</div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <>
          <div className="fixed inset-0 bg-brand-navy/60 z-30" onClick={() => !busy && setModal(null)} />
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-none">
            <div className="card max-w-lg w-full p-6 pointer-events-auto animate-slideUp">
              {modal === "deactivate" && (
                <>
                  <h3 className="h-section text-brand-amber">Pause {orgName}</h3>
                  <p className="text-sm text-ink-muted mt-2">
                    Marks this org as <strong>Inactive</strong>. This is reversible — reactivate any time.
                    No logins are revoked, but the customer is flagged as paused for billing/reporting purposes.
                  </p>
                  <textarea
                    className="input mt-4 min-h-[60px]"
                    placeholder="Reason (optional, e.g., billing issue, contract renewal in progress)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </>
              )}

              {modal === "reactivate" && (
                <>
                  <h3 className="h-section">Reactivate {orgName}</h3>
                  <p className="text-sm text-ink-muted mt-2">
                    Restores the org to <strong>Active</strong>. If users were marked Inactive on offboard, they
                    will need to be re-activated individually from the Users page.
                  </p>
                </>
              )}

              {modal === "offboard" && (
                <>
                  <h3 className="h-section text-brand-red">Offboard {orgName}</h3>
                  <p className="text-sm mt-2">
                    This action will:
                  </p>
                  <ul className="list-disc list-inside text-sm text-ink-slate mt-2 space-y-1">
                    <li>Mark org status as <strong>Offboarded</strong></li>
                    <li>Set all <strong>{userCount} users</strong> to Inactive (logins disabled)</li>
                    <li>Preserve all data for export/audit until manually deleted</li>
                  </ul>
                  <div className="mt-4 p-3 bg-brand-red/5 border border-brand-red/30 rounded-brand text-sm">
                    <strong>Reversible</strong> only by clicking "Re-onboard". Users must be re-activated individually after that.
                    <br /><strong>Recommended:</strong> click "Export data" first so the customer keeps their data.
                  </div>
                  <textarea
                    className="input mt-4 min-h-[60px]"
                    placeholder="Reason (optional, recorded in audit log)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <div className="mt-3">
                    <label className="label">Type the org name to confirm: <span className="font-mono text-brand-red">{orgName}</span></label>
                    <input
                      className="input"
                      value={confirmName}
                      onChange={(e) => setConfirmName(e.target.value)}
                      placeholder={orgName}
                    />
                  </div>
                </>
              )}

              {error && <div className="text-sm text-brand-red mt-3">{error}</div>}

              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setModal(null)} disabled={busy} className="btn-ghost">Cancel</button>
                <button
                  onClick={() => callLifecycle(modal!)}
                  disabled={busy || (modal === "offboard" && confirmName !== orgName)}
                  className={
                    modal === "offboard"
                      ? "btn-primary !bg-brand-red"
                      : modal === "deactivate"
                        ? "btn-primary !bg-brand-amber"
                        : "btn-primary"
                  }
                >
                  {busy ? "Working…"
                    : modal === "offboard" ? "Offboard"
                    : modal === "deactivate" ? "Pause org"
                    : "Reactivate"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
