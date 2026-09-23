"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Searchable dropdown for picking a customer org.
 *
 * Used on /admin/users (paramKey="orgId") and /director/questions (paramKey="view").
 * Scales to dozens of orgs without overwhelming the UI like a pill row would.
 *
 * Behavior:
 *   - Default state: shows the currently-selected org (or "All companies").
 *   - Click → opens panel with autofocused search input + filtered list.
 *   - Selecting an option navigates to `${routeBase}?${paramKey}=${id}`.
 *   - Selecting "All" navigates to `routeBase` with no query param.
 *   - Optional `extraOptions` prop adds non-org choices like "🌐 Platform (global)".
 */

interface OrgOption {
  id: string;
  name: string;
  brandColor?: string | null;
  brandLogoUrl?: string | null;
  count?: number;
}

interface ExtraOption {
  // Value goes into the URL as `?paramKey=<value>`. If null, the param is omitted (= "All").
  value: string | null;
  label: string;
  emoji?: string;
  count?: number;
}

export function OrgPicker({
  orgs,
  selectedValue,
  paramKey,
  routeBase,
  allLabel = "All companies",
  extraOptions = [],
  totalCount,
  placeholder = "Search companies…",
}: {
  orgs: OrgOption[];
  selectedValue: string;          // "" = All, or an org id, or an extra-option value
  paramKey: string;               // "orgId" or "view"
  routeBase: string;              // "/admin/users" or "/director/questions"
  allLabel?: string;
  extraOptions?: ExtraOption[];
  totalCount?: number;            // shown next to "All" label
  placeholder?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Resolve what's currently selected for the trigger button display
  const selectedOrg = orgs.find((o) => o.id === selectedValue);
  const selectedExtra = extraOptions.find((e) => e.value === selectedValue);
  const isAllSelected = !selectedValue || selectedValue === "";

  // Close on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const filteredOrgs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? orgs.filter((o) => o.name.toLowerCase().includes(q)) : orgs;
  }, [orgs, query]);

  function pick(value: string | null) {
    setOpen(false);
    setQuery("");
    if (value === null || value === "") {
      router.push(routeBase);
    } else {
      router.push(`${routeBase}?${paramKey}=${encodeURIComponent(value)}`);
    }
  }

  return (
    <div ref={containerRef} className="relative inline-block w-full sm:w-80">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-brand border border-ink-softLine bg-white text-sm font-semibold hover:border-brand-indigo/40 transition-colors text-left"
      >
        <span className="flex items-center gap-2 min-w-0">
          {selectedOrg ? (
            <>
              {selectedOrg.brandLogoUrl ? (
                <img src={selectedOrg.brandLogoUrl} alt="" className="w-4 h-4 rounded object-contain shrink-0" />
              ) : (
                <span
                  className="w-3 h-3 rounded-sm shrink-0"
                  style={{ background: selectedOrg.brandColor || "#1F3C88" }}
                  aria-hidden="true"
                />
              )}
              <span className="truncate">{selectedOrg.name}</span>
            </>
          ) : selectedExtra ? (
            <>
              {selectedExtra.emoji && <span aria-hidden="true">{selectedExtra.emoji}</span>}
              <span className="truncate">{selectedExtra.label}</span>
            </>
          ) : (
            <>
              <span className="text-ink-muted">📂</span>
              <span className="truncate">{allLabel}</span>
            </>
          )}
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {(selectedOrg?.count ?? selectedExtra?.count ?? totalCount) !== undefined && (
            <span className="text-xs font-mono text-ink-muted">
              {selectedOrg?.count ?? selectedExtra?.count ?? totalCount}
            </span>
          )}
          <svg
            className={`w-4 h-4 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
          >
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-30 left-0 right-0 mt-1 bg-white rounded-brand border border-ink-softLine shadow-cardHover overflow-hidden"
        >
          <input
            autoFocus
            type="text"
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full px-4 py-2.5 text-sm border-b border-ink-softLine focus:outline-none"
            aria-label="Filter companies"
          />
          <ul className="max-h-72 overflow-y-auto py-1">
            {/* All option always first */}
            <li>
              <button
                type="button"
                onClick={() => pick(null)}
                className={`w-full flex items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-brand-indigo/5 ${
                  isAllSelected ? "bg-brand-indigo/10 font-semibold" : ""
                }`}
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden="true">📂</span>
                  <span>{allLabel}</span>
                </span>
                {totalCount !== undefined && (
                  <span className="text-xs font-mono text-ink-muted">{totalCount}</span>
                )}
              </button>
            </li>

            {/* Extra options (e.g., "🌐 Platform global") */}
            {extraOptions.map((e) => {
              const active = selectedValue === e.value;
              return (
                <li key={`extra-${e.value}`}>
                  <button
                    type="button"
                    onClick={() => pick(e.value)}
                    className={`w-full flex items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-brand-indigo/5 ${
                      active ? "bg-brand-indigo/10 font-semibold" : ""
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {e.emoji && <span aria-hidden="true">{e.emoji}</span>}
                      <span>{e.label}</span>
                    </span>
                    {e.count !== undefined && (
                      <span className="text-xs font-mono text-ink-muted">{e.count}</span>
                    )}
                  </button>
                </li>
              );
            })}

            {(extraOptions.length > 0 || true) && filteredOrgs.length > 0 && (
              <li className="px-4 py-1 text-[10px] uppercase tracking-wider text-ink-muted font-semibold border-t border-ink-softLine mt-1 pt-2">
                Companies
              </li>
            )}

            {filteredOrgs.length === 0 ? (
              <li className="px-4 py-3 text-sm text-ink-muted text-center">No matching companies</li>
            ) : (
              filteredOrgs.map((o) => {
                const active = selectedValue === o.id;
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => pick(o.id)}
                      className={`w-full flex items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-brand-indigo/5 ${
                        active ? "bg-brand-indigo/10 font-semibold" : ""
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {o.brandLogoUrl ? (
                          <img src={o.brandLogoUrl} alt="" className="w-4 h-4 rounded object-contain shrink-0" />
                        ) : (
                          <span
                            className="w-3 h-3 rounded-sm shrink-0"
                            style={{ background: o.brandColor || "#1F3C88" }}
                            aria-hidden="true"
                          />
                        )}
                        <span className="truncate">{o.name}</span>
                      </span>
                      {o.count !== undefined && (
                        <span className="text-xs font-mono text-ink-muted">{o.count}</span>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
