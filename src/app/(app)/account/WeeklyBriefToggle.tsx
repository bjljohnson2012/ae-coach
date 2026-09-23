"use client";
import { useState } from "react";

/**
 * Opt-in toggle for the weekly improvement-tip email. Users subscribe; an
 * upcoming worker (v3.34) sends a personalized brief based on their growth
 * areas + skill scores every Monday. For now this just persists the
 * preference; the sender ships next.
 */
export function WeeklyBriefToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function toggle() {
    const next = !enabled;
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/me/weekly-brief", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscribed: next }),
    });
    setBusy(false);
    if (!res.ok) {
      setMsg("Couldn't update. Try again.");
      return;
    }
    setEnabled(next);
    setMsg(next ? "✓ Subscribed" : "Unsubscribed");
    setTimeout(() => setMsg(null), 2500);
  }

  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={toggle}
        disabled={busy}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 mt-0.5 ${
          enabled ? "bg-brand-emerald" : "bg-ink-softLine"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform shadow ${
            enabled ? "translate-x-5" : "translate-x-0"
          }`}
          aria-hidden="true"
        />
      </button>
      <div className="flex-1">
        <div className="font-display font-semibold text-sm">Weekly improvement brief</div>
        <p className="text-xs text-ink-muted mt-0.5">
          Every Monday morning, get a short, fun email with practical tips for the areas
          where you're focusing on improvement. Tailored to your growth areas and personality.
        </p>
        {msg && (
          <p className="text-xs text-brand-emerald mt-1.5">{msg}</p>
        )}
      </div>
    </div>
  );
}
