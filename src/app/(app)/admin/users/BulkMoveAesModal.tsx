"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface DirectorOption {
  id: string;          // User ID
  name: string;
  email: string;
  orgId: string;
  orgName?: string;
}

interface SelectedAe {
  id: string;          // User ID
  name: string;
  email: string;
  orgId: string;
  orgName?: string;
  currentDirectorName?: string | null;
}

/**
 * Modal for bulk-reassigning multiple AEs to a single director.
 *
 * The parent (AeRosterClient) renders this when the user clicks "Move to
 * director..." in the bulk-action toolbar. The modal shows the selected AEs,
 * a searchable director dropdown filtered to the relevant orgs, and confirm
 * vs cancel buttons. Per-AE results surface in a summary on completion.
 */
export function BulkMoveAesModal({
  selectedAes,
  directors,
  onClose,
  onComplete,
}: {
  selectedAes: SelectedAe[];
  directors: DirectorOption[];
  onClose: () => void;
  onComplete: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pickedDirectorId, setPickedDirectorId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    ok: boolean;
    successCount: number;
    failureCount: number;
    targetDirectorName: string | null;
    results: Array<{ userId: string; ok: boolean; error?: string }>;
  } | null>(null);

  // Filter directors to only those in the org(s) of the selected AEs.
  // Cross-org bulk moves don't make sense — the API would reject anyway.
  const eligibleOrgIds = useMemo(() => {
    return new Set(selectedAes.map((a) => a.orgId));
  }, [selectedAes]);

  const filteredDirectors = useMemo(() => {
    const q = query.trim().toLowerCase();
    let dirs = directors.filter((d) => eligibleOrgIds.has(d.orgId));
    if (q) {
      dirs = dirs.filter((d) =>
        d.name.toLowerCase().includes(q) || d.email.toLowerCase().includes(q)
      );
    }
    return dirs.slice(0, 50);
  }, [directors, query, eligibleOrgIds]);

  // Close on Escape
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  async function confirm() {
    if (!pickedDirectorId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users/bulk-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: selectedAes.map((a) => a.id),
          directorId: pickedDirectorId,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "Move failed.");
        setBusy(false);
        return;
      }
      setResult(j);
      setBusy(false);
    } catch (err: any) {
      setError(err?.message || "Network error.");
      setBusy(false);
    }
  }

  function done() {
    onComplete();
    router.refresh();
  }

  // Result view — shown after the API call completes
  if (result) {
    const aesById = new Map(selectedAes.map((a) => [a.id, a]));
    return (
      <>
        <div className="fixed inset-0 bg-brand-navy/60 z-30" onClick={done} />
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-none">
          <div className="card max-w-lg w-full p-6 pointer-events-auto animate-slideUp">
            <h3 className="h-section">
              {result.ok ? "✓ All moved" : `${result.successCount} of ${result.results.length} moved`}
            </h3>
            <p className="text-sm text-ink-muted mt-2">
              {result.targetDirectorName
                ? <>Director: <strong>{result.targetDirectorName}</strong></>
                : "Director: (unassigned)"}
            </p>

            {result.failureCount > 0 && (
              <div className="mt-4 p-3 rounded-brand bg-brand-amber/5 border border-brand-amber/30 text-sm">
                <div className="font-semibold text-brand-amber mb-1">{result.failureCount} couldn't be moved</div>
                <ul className="text-xs text-ink-slate space-y-1">
                  {result.results.filter((r) => !r.ok).map((r) => {
                    const ae = aesById.get(r.userId);
                    return (
                      <li key={r.userId}>
                        <strong>{ae?.name ?? r.userId}</strong>: {r.error}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={done} className="btn-primary">Done</button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-brand-navy/60 z-30" onClick={() => !busy && onClose()} />
      <div className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-none">
        <div ref={dialogRef} className="card max-w-2xl w-full p-6 pointer-events-auto animate-slideUp max-h-[90vh] overflow-y-auto">
          <h3 className="h-section">Move {selectedAes.length} {selectedAes.length === 1 ? "AE" : "AEs"} to a director</h3>
          <p className="text-sm text-ink-muted mt-1">
            Pick the new director below. Each AE keeps their org assignment — only the director changes.
          </p>

          {/* Selected AEs preview */}
          <div className="mt-4">
            <div className="eyebrow mb-2">Selected ({selectedAes.length})</div>
            <div className="max-h-32 overflow-y-auto bg-surface-soft rounded-brand p-2 border border-ink-softLine">
              <ul className="text-xs space-y-1">
                {selectedAes.map((ae) => (
                  <li key={ae.id} className="flex items-center justify-between gap-2">
                    <span><strong>{ae.name}</strong> <span className="text-ink-muted font-mono">{ae.email}</span></span>
                    {ae.currentDirectorName && (
                      <span className="text-ink-muted">→ currently {ae.currentDirectorName}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Director picker */}
          <div className="mt-4">
            <label className="label">Move to director</label>
            <input
              type="text"
              className="input"
              placeholder="Search by name or email…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <ul className="mt-2 max-h-56 overflow-y-auto rounded-brand border border-ink-softLine">
              {filteredDirectors.length === 0 ? (
                <li className="px-3 py-2 text-sm text-ink-muted text-center">
                  No directors{query ? " match" : ""} in the selected AEs' orgs.
                </li>
              ) : (
                filteredDirectors.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => setPickedDirectorId(d.id)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-brand-indigo/5 transition-colors ${
                        pickedDirectorId === d.id ? "bg-brand-indigo/10 font-semibold" : ""
                      }`}
                    >
                      <span>
                        <span className="font-medium">{d.name}</span>{" "}
                        <span className="text-ink-muted text-xs font-mono">{d.email}</span>
                      </span>
                      {d.orgName && <span className="text-xs text-ink-muted">{d.orgName}</span>}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

          {error && <div className="text-sm text-brand-red bg-brand-red/5 border border-brand-red/20 rounded-brand p-3 mt-4">{error}</div>}

          <div className="flex justify-end gap-2 mt-5">
            <button onClick={onClose} disabled={busy} className="btn-ghost">Cancel</button>
            <button
              onClick={confirm}
              disabled={!pickedDirectorId || busy}
              className="btn-primary"
            >
              {busy ? "Moving…" : `Move ${selectedAes.length} ${selectedAes.length === 1 ? "AE" : "AEs"}`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
