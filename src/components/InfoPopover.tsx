"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Click-to-open info popover, v3.37.1.
 *
 * Two trigger styles:
 *   - icon-only ("ⓘ")               — default; tight row layouts
 *   - labeled pill ("Learn more ⓘ") — when triggerLabel is passed; CTA-style
 *
 * Popover renders via portal into document.body and uses fixed positioning
 * derived from the trigger's bounding rect. This is critical: card containers
 * use `overflow-hidden` for rounded corners, which would clip an absolutely-
 * positioned child popover. Portal escapes that.
 *
 * Closes on outside click, Escape, or window scroll/resize (so it doesn't
 * float orphaned when the page moves under it).
 *
 * Trigger styling:
 *   onDarkBg=true assumes the trigger sits on a saturated gradient header.
 *   It uses white-on-white-translucent for WCAG AA contrast over almost any
 *   brand color. Off (default) uses ink-slate text.
 */
export function InfoPopover({
  label,
  triggerLabel,
  onDarkBg = false,
  children,
}: {
  /** Title shown at the top of the popover and used by screen readers. */
  label: string;
  /** Optional CTA text on the trigger, e.g. "Learn more". Renders as a pill. */
  triggerLabel?: string;
  /** Set true when the trigger sits on a brand-color gradient header. */
  onDarkBg?: boolean;
  /** Popover body. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Reposition the popover whenever it opens or the page reflows. We use
  // fixed positioning so values are viewport-relative (no scroll math
  // needed) — but we need to update on scroll/resize because the trigger
  // moves with the page.
  useLayoutEffect(() => {
    if (!open) return;
    function recompute() {
      const t = triggerRef.current;
      if (!t) return;
      const r = t.getBoundingClientRect();
      const popoverWidth = Math.min(448, window.innerWidth - 32); // 28rem cap
      // Default: align right edge of popover to right edge of trigger.
      let left = r.right - popoverWidth;
      // If that would push it off the left edge, clamp to viewport.
      if (left < 16) left = 16;
      // If trigger is on the left half of viewport, prefer left-anchor instead.
      if (r.left < window.innerWidth / 2) left = Math.min(r.left, window.innerWidth - popoverWidth - 16);
      const top = r.bottom + 6;
      setPos({ top, left, width: popoverWidth });
    }
    recompute();
    window.addEventListener("scroll", recompute, true);
    window.addEventListener("resize", recompute);
    return () => {
      window.removeEventListener("scroll", recompute, true);
      window.removeEventListener("resize", recompute);
    };
  }, [open]);

  // Outside click + Escape close
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Trigger className picks contrast-safe combos. Both variants meet WCAG AA
  // against the surfaces they're used on (slate-on-white for icon, white-text-
  // on-white-translucent over saturated gradients).
  const triggerClass = triggerLabel
    ? onDarkBg
      ? "inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/95 text-brand-indigo text-xs font-bold shadow-sm hover:bg-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-indigo transition-colors"
      : "inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-brand-indigo text-brand-indigo text-xs font-bold hover:bg-brand-indigo/10 focus-visible:ring-2 focus-visible:ring-brand-indigo focus-visible:ring-offset-2 transition-colors"
    : onDarkBg
      ? "w-6 h-6 inline-flex items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/35 text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-white"
      : "w-5 h-5 inline-flex items-center justify-center rounded-full text-ink-slate hover:text-brand-indigo hover:bg-brand-indigo/10 text-[11px] font-bold transition-colors";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          // Don't bubble — many callers wrap rows in their own click handler
          // (drill-in drawers etc.) and we don't want to fire that too.
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={triggerClass}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={triggerLabel ? `${triggerLabel} about ${label}` : `Info about ${label}`}
        title={`What is ${label}?`}
      >
        {triggerLabel ? (
          <>
            <span>{triggerLabel}</span>
            <span aria-hidden="true" className="text-[11px] opacity-90">ⓘ</span>
          </>
        ) : (
          <span aria-hidden="true">ⓘ</span>
        )}
      </button>

      {/* Portal popover — escapes any overflow:hidden ancestor */}
      {mounted && open && pos && createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-modal="false"
          aria-label={`${label} info`}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-[60] card border border-ink-softLine shadow-cardHover p-4 text-sm animate-slideUp"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <div className="font-display font-bold text-ink">{label}</div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setOpen(false); }}
              className="text-ink-muted hover:text-ink text-lg leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}
