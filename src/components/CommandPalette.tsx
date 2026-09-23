"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface ResultItem {
  kind: "ae" | "director" | "article" | "product" | "page";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

const KIND_LABEL: Record<ResultItem["kind"], string> = {
  ae: "AE",
  director: "Director",
  article: "Article",
  product: "Product",
  page: "Page",
};

const KIND_COLOR: Record<ResultItem["kind"], string> = {
  ae:       "bg-brand-indigo/15 text-brand-indigo",
  director: "bg-brand-orange/15 text-brand-orange",
  article:  "bg-brand-emerald/15 text-brand-emerald",
  product:  "bg-brand-amber/15 text-brand-amber",
  page:     "bg-ink-softLine text-ink-slate",
};

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ResultItem[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cmd-K / Ctrl-K to open
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus input on open + clear state
  useEffect(() => {
    if (open) {
      setActive(0);
      setQ("");
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const j = await res.json();
          setResults(j.results ?? []);
          setActive(0);
        }
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q]);

  function go(item: ResultItem) {
    setOpen(false);
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      go(results[active]);
    }
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-brand-navy/60 z-50" onClick={() => setOpen(false)} />
      <div className="fixed inset-x-0 top-[10vh] z-[60] flex items-start justify-center px-4 pointer-events-none">
        <div className="card max-w-xl w-full p-0 pointer-events-auto animate-slideUp overflow-hidden shadow-cardHover">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-ink-softLine">
            <svg className="w-5 h-5 text-ink-muted" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search AEs, directors, articles, products, pages…"
              className="flex-1 outline-none text-sm bg-transparent"
            />
            <kbd className="text-xs px-1.5 py-0.5 rounded border border-ink-softLine font-mono">esc</kbd>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {!q.trim() ? (
              <div className="p-8 text-center text-sm text-ink-muted">
                Type to search across people, articles, and pages.
                <div className="mt-2 text-xs">
                  <kbd className="px-1.5 py-0.5 rounded border border-ink-softLine font-mono">↑</kbd>
                  <kbd className="px-1.5 py-0.5 rounded border border-ink-softLine font-mono ml-1">↓</kbd>
                  <span className="ml-2">to navigate · </span>
                  <kbd className="px-1.5 py-0.5 rounded border border-ink-softLine font-mono">↵</kbd>
                  <span className="ml-2">to open</span>
                </div>
              </div>
            ) : loading && results.length === 0 ? (
              <div className="p-6 text-center text-sm text-ink-muted">Searching…</div>
            ) : results.length === 0 ? (
              <div className="p-6 text-center text-sm text-ink-muted">No matches.</div>
            ) : (
              <ul>
                {results.map((r, i) => (
                  <li key={`${r.kind}-${r.id}-${i}`}>
                    <button
                      type="button"
                      onClick={() => go(r)}
                      onMouseEnter={() => setActive(i)}
                      className={`w-full px-4 py-2.5 flex items-center gap-3 text-left text-sm transition-colors ${
                        active === i ? "bg-brand-indigo/10" : "hover:bg-surface-soft"
                      }`}
                    >
                      <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${KIND_COLOR[r.kind]} shrink-0`}>
                        {KIND_LABEL[r.kind]}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-medium truncate">{r.title}</span>
                        {r.subtitle && <span className="block meta truncate">{r.subtitle}</span>}
                      </span>
                      <svg className="w-4 h-4 text-ink-muted shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="px-4 py-2 border-t border-ink-softLine text-xs text-ink-muted bg-surface-soft flex items-center justify-between">
            <span>{results.length} result{results.length === 1 ? "" : "s"}</span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded border border-ink-softLine font-mono">⌘K</kbd> to reopen
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
