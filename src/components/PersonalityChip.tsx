"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TypeExplanation } from "@/lib/personalityExplainers";

/**
 * Personality type chip — DISC, Enneagram, MBTI.
 *
 * v3.37.10 changes:
 *   - Click opens a SIDE DRAWER (slides in from the right) instead of an
 *     inline popover. Drawer renders into document.body via portal so it
 *     can't be clipped by `card overflow-hidden` ancestors. Bigger reading
 *     surface, doesn't fight the page layout.
 *   - `onDarkBg` prop. When true, chip uses white-pill-on-translucent for
 *     readable contrast (≥ 7:1) on the navy gradient hero. When false,
 *     uses the indigo-on-tint chip (was the only style before — failed AA
 *     against dark gradients, which is where every profile card uses it).
 *   - Drawer body: condensed but still complete — summary, strengths,
 *     watch-outs, in-sales paragraph, how-to-coach paragraph. Larger fonts
 *     than the popover; better for scanning.
 */

const FRAMEWORK_LABEL: Record<string, string> = {
  DISC: "DISC",
  ENNEAGRAM: "Enneagram",
  MBTI: "Myers-Briggs",
};

export function PersonalityChip({
  framework,
  rawCode,
  explanation,
  onDarkBg = false,
}: {
  framework: "DISC" | "ENNEAGRAM" | "MBTI";
  rawCode: string;
  explanation: TypeExplanation | null;
  /** True when the chip sits on a saturated brand-color background (e.g. the
   * hero gradient). Switches the chip palette to white-on-translucent for
   * WCAG AAA contrast. */
  onDarkBg?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Lock body scroll while drawer is open + Escape to close.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = `${FRAMEWORK_LABEL[framework]}: ${rawCode}`;

  // No explanation available — render as a plain badge, no click target.
  if (!explanation) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-brand text-xs font-mono ${
          onDarkBg ? "bg-white/15 text-white" : "bg-ink-softLine/60 text-ink"
        }`}
      >
        {label}
      </span>
    );
  }

  // Chip styling: WCAG AAA contrast on either background.
  const chipClass = onDarkBg
    ? "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-brand bg-white/95 text-brand-indigo text-xs font-mono font-bold shadow-sm hover:bg-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-indigo transition-colors cursor-pointer"
    : "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-brand bg-brand-indigo text-white text-xs font-mono font-bold hover:bg-brand-indigoDeep focus-visible:ring-2 focus-visible:ring-brand-indigo focus-visible:ring-offset-2 transition-colors cursor-pointer";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={chipClass}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={`What does ${label} mean?`}
      >
        {label}
        <span className="text-[11px] opacity-90" aria-hidden="true">ⓘ</span>
      </button>

      {/* Side drawer — portal to body so card overflow doesn't clip us. */}
      {mounted && open && createPortal(
        <DrawerShell onClose={() => setOpen(false)}>
          <DrawerBody framework={framework} rawCode={rawCode} explanation={explanation} />
        </DrawerShell>,
        document.body,
      )}
    </>
  );
}

/**
 * Slide-in side drawer chrome. Backdrop + animated panel + close button.
 * Reusable shape — every type-explainer drawer (and future ones) renders
 * inside this shell.
 */
function DrawerShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus the panel for keyboard users on open.
  useEffect(() => { panelRef.current?.focus(); }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[70]"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-brand-navy/60 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel — slides in from the right. Caps width on desktop so the
          page behind stays partially visible; full-width on mobile. */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className="absolute right-0 top-0 bottom-0 w-full sm:w-[28rem] bg-white shadow-cardHover overflow-y-auto animate-slideInRight outline-none"
      >
        <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-ink-softLine px-5 py-3 flex items-center justify-between">
          <span className="eyebrow">Type explainer</span>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 inline-flex items-center justify-center rounded-brand text-ink-slate hover:text-ink hover:bg-ink-softLine/40 transition-colors"
            aria-label="Close drawer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

function DrawerBody({
  framework,
  rawCode,
  explanation,
}: {
  framework: "DISC" | "ENNEAGRAM" | "MBTI";
  rawCode: string;
  explanation: TypeExplanation;
}) {
  return (
    <>
      <div className="text-xs uppercase tracking-wider text-ink-slate mb-1.5">
        {FRAMEWORK_LABEL[framework]} · <span className="font-mono">{rawCode}</span>
      </div>
      <h2 className="font-display font-bold text-2xl leading-tight">{explanation.label}</h2>
      <p className="text-sm text-ink-slate mt-3 leading-relaxed">{explanation.summary}</p>

      <div className="grid sm:grid-cols-2 gap-4 mt-5">
        <section>
          <div className="text-xs uppercase tracking-wider font-bold text-brand-emerald mb-2">Strengths</div>
          <ul className="space-y-1.5 text-sm text-ink-slate">
            {explanation.strengths.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-brand-emerald font-bold shrink-0">+</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <div className="text-xs uppercase tracking-wider font-bold text-brand-amber mb-2">Watch-outs</div>
          <ul className="space-y-1.5 text-sm text-ink-slate">
            {explanation.watchOuts.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-brand-amber font-bold shrink-0">↗</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-5">
        <div className="text-xs uppercase tracking-wider font-bold text-brand-indigo mb-1.5">In sales</div>
        <p className="text-sm text-ink-slate leading-relaxed">{explanation.inSales}</p>
      </section>

      <section className="mt-4">
        <div className="text-xs uppercase tracking-wider font-bold text-brand-orange mb-1.5">How to coach this person</div>
        <p className="text-sm text-ink-slate leading-relaxed">{explanation.coachThem}</p>
      </section>
    </>
  );
}
