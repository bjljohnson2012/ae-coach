"use client";
import { useState } from "react";
import Link from "next/link";
import { ImpersonateButton } from "./ImpersonateButton";
import { BulkMoveAesModal } from "./BulkMoveAesModal";

interface AeRow {
  id: string;          // User ID
  name: string;
  email: string;
  orgId: string;
  orgName?: string;
  status: string;
  imageUrl: string | null;
  lastLoginAt: Date | null;
  currentDirectorName: string | null;
}

interface DirectorOption {
  id: string;
  name: string;
  email: string;
  orgId: string;
  orgName?: string;
}

/**
 * Client wrapper around the AE roster table that adds:
 *   - Checkbox per AE row
 *   - Sticky bulk-action toolbar showing N selected + "Move to director..." button
 *   - Bulk-move modal
 *
 * The table itself is rendered server-side and passed in via the `aes` prop;
 * we only manage selection state + the modal here.
 */
export function AeRosterClient({
  aes,
  directors,
  isOrgAdmin,
}: {
  aes: AeRow[];
  directors: DirectorOption[];
  isOrgAdmin: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);

  const allSelected = aes.length > 0 && selected.size === aes.length;
  const someSelected = selected.size > 0 && !allSelected;

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(aes.map((a) => a.id)));
    }
  }

  const selectedAes = aes.filter((a) => selected.has(a.id));

  return (
    <>
      {/* Sticky bulk-action bar — only visible when at least one AE is selected.
          Lets the user see counts and trigger bulk move without scrolling. */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-20 mb-3 -mx-1 px-3 py-2.5 rounded-brand bg-brand-indigo text-white shadow-cardHover flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm">
            <strong>{selected.size}</strong> {selected.size === 1 ? "AE" : "AEs"} selected
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowModal(true)}
              className="px-3 py-1.5 rounded-brand bg-white text-brand-indigo text-xs font-semibold hover:bg-white/90"
            >
              ⇄ Move to director…
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="px-3 py-1.5 rounded-brand border border-white/40 text-white text-xs font-semibold hover:bg-white/10"
            >
              Clear selection
            </button>
          </div>
        </div>
      )}

      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wider text-ink-muted">
          <tr>
            <th className="px-5 py-2 font-semibold w-10">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected; }}
                onChange={toggleAll}
                aria-label="Select all AEs"
              />
            </th>
            <th className="px-5 py-2 font-semibold">Name</th>
            <th className="px-5 py-2 font-semibold">Email</th>
            {isOrgAdmin && <th className="px-5 py-2 font-semibold">Company</th>}
            <th className="px-5 py-2 font-semibold">Director</th>
            <th className="px-5 py-2 font-semibold">Status</th>
            <th className="px-5 py-2 font-semibold">Last login</th>
            <th className="px-5 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {aes.map((u) => (
            <tr key={u.id} className={`border-t border-ink-softLine hover:bg-brand-indigo/5 ${selected.has(u.id) ? "bg-brand-indigo/10" : ""}`}>
              <td className="px-5 py-3">
                <input
                  type="checkbox"
                  checked={selected.has(u.id)}
                  onChange={() => toggle(u.id)}
                  aria-label={`Select ${u.name}`}
                />
              </td>
              <td className="px-5 py-3">
                <div className="flex items-center gap-3">
                  {u.imageUrl ? (
                    <img src={u.imageUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-indigo to-brand-orange flex items-center justify-center text-white text-xs font-semibold" aria-hidden="true">
                      {u.name.charAt(0)}
                    </div>
                  )}
                  <span className="font-medium">{u.name}</span>
                </div>
              </td>
              <td className="px-5 py-3 text-ink-slate font-mono text-xs">{u.email}</td>
              {isOrgAdmin && (
                <td className="px-5 py-3">
                  <span className="text-xs">{u.orgName ?? "—"}</span>
                </td>
              )}
              <td className="px-5 py-3 text-xs">
                {u.currentDirectorName ?? <span className="text-ink-muted italic">unassigned</span>}
              </td>
              <td className="px-5 py-3">
                {u.status === "ACTIVE" ? <span className="badge-success">Active</span>
                  : u.status === "PENDING" ? <span className="badge-warning">Pending</span>
                  : <span className="badge-neutral">Inactive</span>}
              </td>
              <td className="px-5 py-3 text-ink-muted text-xs">
                {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never"}
              </td>
              <td className="px-5 py-3 text-right whitespace-nowrap">
                <Link href={`/admin/users/${u.id}/edit`} className="link text-xs">Edit</Link>
                {isOrgAdmin && (
                  <ImpersonateButton userId={u.id} userName={u.name} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal && (
        <BulkMoveAesModal
          selectedAes={selectedAes}
          directors={directors}
          onClose={() => setShowModal(false)}
          onComplete={() => {
            setShowModal(false);
            setSelected(new Set());
          }}
        />
      )}
    </>
  );
}
