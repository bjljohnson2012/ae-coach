"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Search-by-name typeahead. Replacement for the AE/user dropdown.
 * Pass a list of options; the input filters them client-side.
 */

interface Option {
  id: string;
  name: string;
  hint?: string;       // e.g. "Director — Acme Sales"
}

export function UserSearch({
  options,
  value,
  onChange,
  placeholder = "Search by name…",
  allowEmpty = false,
}: {
  options: Option[];
  value: string;          // selected option id
  onChange: (id: string) => void;
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value) ?? null;

  // Close on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => (o.name + " " + (o.hint ?? "")).toLowerCase().includes(q))
    : options;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="input flex items-center justify-between text-left"
      >
        <span className={selected ? "text-ink" : "text-ink-muted"}>
          {selected ? selected.name : (allowEmpty ? "— none —" : "Pick someone")}
        </span>
        <svg className="w-4 h-4 text-ink-muted" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>

      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1 card overflow-hidden">
          <input
            autoFocus
            className="w-full px-4 py-2 text-sm border-b border-ink-softLine focus:outline-none"
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="max-h-64 overflow-y-auto">
            {allowEmpty && (
              <li>
                <button
                  type="button"
                  onClick={() => { onChange(""); setOpen(false); setQuery(""); }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-brand-indigo/5"
                >
                  <span className="text-ink-muted italic">— none —</span>
                </button>
              </li>
            )}
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-ink-muted text-center">No matches</li>
            ) : (
              filtered.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => { onChange(o.id); setOpen(false); setQuery(""); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-brand-indigo/5 flex items-baseline justify-between ${
                      o.id === value ? "bg-brand-indigo/10" : ""
                    }`}
                  >
                    <span className="font-medium">{o.name}</span>
                    {o.hint && <span className="meta">{o.hint}</span>}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
