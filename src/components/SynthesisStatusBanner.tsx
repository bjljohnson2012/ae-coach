"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Polling banner for async profile synthesis — v3.37.5.
 *
 * Renders only when the current user's profile has `synthesisStatus !== READY`.
 * Polls /api/synthesis-status every 5s while GENERATING. When status flips to
 * READY, fires router.refresh() so the dashboard re-fetches and the banner
 * disappears on the next render.
 *
 * On FAILED, shows the error + a retry button that re-submits the latest
 * answer set. The retry endpoint is /api/synthesis-retry.
 *
 * The banner accepts initial state from the server-rendered dashboard so
 * we don't flash "loading" before the first poll resolves.
 */
type Initial = {
  status: "GENERATING" | "FAILED" | "READY" | null;
  error: string | null;
  startedAt: string | null;
  ageSeconds: number;
  /** v3.37.6 — true when the user has a COMPLETED answerSet but no synthesis
   * ever finished (legacy state from before async). Banner shows the retry
   * CTA same as a real failure. */
  isOrphaned?: boolean;
};

export function SynthesisStatusBanner({
  initial,
  role,
}: {
  initial: Initial;
  /** Optional — caller passes their role so non-admins see "Request retry"
   * instead of "Try again". Defaults to admin behavior so legacy callers
   * keep working until they pass it through. */
  role?: string;
}) {
  const router = useRouter();
  const [s, setS] = useState<Initial>(initial);
  const [retrying, setRetrying] = useState(false);
  const [requestNote, setRequestNote] = useState<string | null>(null);
  const isAdmin = !role || role === "ORG_ADMIN" || role === "COMPANY_ADMIN";

  useEffect(() => {
    // Only poll while we're actively generating. READY/FAILED/null are terminal
    // for the polling loop (the user has to act to re-enter GENERATING).
    if (s.status !== "GENERATING") return;

    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/synthesis-status", { cache: "no-store" });
        if (!res.ok) return;
        const j = await res.json();
        if (cancelled) return;
        setS({
          status: j.status,
          error: j.error,
          startedAt: j.startedAt,
          ageSeconds: j.ageSeconds,
          isOrphaned: j.isOrphaned,
        });
        // Synthesis just finished — refresh the page so server components
        // re-fetch and show the new profile.
        if (j.isReady) router.refresh();
      } catch {
        /* swallow — we'll just retry next tick */
      }
    };

    const id = setInterval(tick, 5_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [s.status, router]);

  // Render for explicit GENERATING / FAILED, AND for orphaned recoverable
  // cases (status is null but the user is actually stuck — banner exposes
  // the retry path). Otherwise nothing.
  if (s.status !== "GENERATING" && s.status !== "FAILED" && !s.isOrphaned) return null;

  if (s.status === "GENERATING") {
    const elapsed = formatElapsed(s.ageSeconds);
    return (
      <section className="card overflow-hidden mb-6 border-l-4 border-brand-orange">
        <div className="px-5 py-4 bg-brand-orange/5">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="text-2xl shrink-0 animate-pulse" aria-hidden="true">✨</div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-semibold text-ink">Generating your profile…</div>
              <p className="text-sm text-ink-slate mt-0.5">
                The AI is reading every answer and building your personality + skill profile against your org's bar.
                This usually takes 5 to 10 minutes — feel free to come back later.
              </p>
              <div className="meta mt-1.5">Running for {elapsed} · checking again every 5 seconds</div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // FAILED or ORPHANED — same UX, slightly different copy.
  return (
    <section className="card overflow-hidden mb-6 border-l-4 border-brand-red">
      <div className="px-5 py-4 bg-brand-red/5">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="text-2xl shrink-0" aria-hidden="true">⚠️</div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-semibold text-ink">
              {s.isOrphaned ? "Finish synthesizing your profile" : "Synthesis hit a snag"}
            </div>
            <p className="text-sm text-ink-slate mt-0.5">
              {s.isOrphaned
                ? "Your intake was submitted but the AI didn't finish building your profile. Your answers are saved — click retry to pick up where it left off."
                : "The AI couldn't finish processing your answers. Your responses are saved. Click retry — most retries succeed."}
            </p>
            {s.error && (
              <details className="mt-2">
                <summary className="text-xs text-ink-muted cursor-pointer">technical detail</summary>
                <pre className="mt-1 text-xs text-ink-muted whitespace-pre-wrap">{s.error.slice(0, 300)}</pre>
              </details>
            )}
            <button
              type="button"
              disabled={retrying || !!requestNote}
              onClick={async () => {
                setRetrying(true);
                try {
                  if (isAdmin) {
                    // Admin: fire retry directly.
                    const res = await fetch("/api/synthesis-retry", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({}),
                    });
                    if (res.ok) {
                      setS({ status: "GENERATING", error: null, startedAt: new Date().toISOString(), ageSeconds: 0 });
                    }
                  } else {
                    // Non-admin: create a request task assigned to a company admin.
                    const res = await fetch("/api/synthesis-request", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({}),
                    });
                    const j = await res.json().catch(() => ({}));
                    if (res.ok) {
                      setRequestNote(
                        j.duplicate
                          ? `Already requested — ${j.assigneeName ?? "your admin"} will run it.`
                          : `Request sent to ${j.assigneeName ?? "your admin"}. They'll re-run when ready.`,
                      );
                    }
                  }
                } finally {
                  setRetrying(false);
                }
              }}
              className="btn-primary text-sm mt-3"
            >
              {retrying
                ? (isAdmin ? "Restarting…" : "Sending…")
                : (isAdmin ? "Try again" : "Request retry from admin")}
            </button>
            {requestNote && (
              <p className="text-xs text-brand-emerald mt-2">{requestNote}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}
