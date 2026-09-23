"use client";
import Link from "next/link";
import { useState } from "react";
import { Markdown } from "@/components/Markdown";

interface CompareResult {
  summary: string;
  alignedAreas: string[];
  frictionPoints: string[];
  adjustments: {
    personality: string[];
    style: string[];
    communication: string[];
    motivations: string[];
    strengths: string[];
    weaknesses: string[];
  };
}

interface ComparePayload {
  result?: CompareResult;
  leaderName?: string;
  targetName?: string;
  leaderTraits?: { disc: string | null; enneagram: string | null; mbti: string | null };
  targetTraits?: { disc: string | null; enneagram: string | null; mbti: string | null };
  needsLeaderIntake?: boolean;
  leaderRole?: string;
  needsTargetIntake?: boolean;
  message?: string;
}

const ADJUST_LABELS: Record<keyof CompareResult["adjustments"], string> = {
  personality: "Personality",
  style: "Sales / Leadership style",
  communication: "Communication",
  motivations: "Motivations",
  strengths: "Strengths",
  weaknesses: "Growth areas",
};

const ADJUST_ICONS: Record<keyof CompareResult["adjustments"], string> = {
  personality: "🧠",
  style: "🎯",
  communication: "💬",
  motivations: "⚡",
  strengths: "✨",
  weaknesses: "📈",
};

function fmtTraits(t?: { disc: string | null; enneagram: string | null; mbti: string | null }): string {
  if (!t) return "";
  return [
    t.disc ? `DISC ${t.disc}` : null,
    t.enneagram ? `Enneagram ${t.enneagram}` : null,
    t.mbti ? `MBTI ${t.mbti}` : null,
  ].filter(Boolean).join(" · ") || "—";
}

export function CompareButton({ targetUserId }: { targetUserId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ComparePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fetchCompare() {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/users/${targetUserId}/coaching-hints/compare`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed");
      }
      setData(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function openCompare() {
    setOpen(true);
    void fetchCompare();
  }

  return (
    <>
      <button type="button" onClick={openCompare} className="btn-secondary text-xs whitespace-nowrap">
        🔀 Compare with my style
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-brand-navy/60 z-30" onClick={() => setOpen(false)} />
          <aside className="fixed right-0 top-0 bottom-0 z-40 w-full max-w-2xl bg-white border-l border-ink-softLine shadow-cardHover overflow-y-auto animate-slideUp">
            <header className="sticky top-0 bg-white border-b border-ink-softLine px-5 py-3 flex items-center justify-between z-10">
              <div>
                <div className="eyebrow">Cross-personality comparison</div>
                <div className="font-display font-semibold text-lg">
                  {data?.leaderName && data?.targetName
                    ? `You ↔ ${data.targetName.split(" ")[0]}`
                    : "Loading…"}
                </div>
                {data?.leaderTraits && data?.targetTraits && (
                  <div className="meta mt-0.5 font-mono text-xs">
                    {fmtTraits(data.leaderTraits)} <span className="text-ink-muted">vs</span> {fmtTraits(data.targetTraits)}
                  </div>
                )}
              </div>
              <button onClick={() => setOpen(false)} className="text-ink-muted hover:text-ink text-lg">✕</button>
            </header>

            <div className="px-5 py-4 space-y-4">
              {loading && <div className="text-sm text-ink-muted">Comparing personalities…</div>}
              {error && <div className="text-sm text-brand-red">{error}</div>}

              {/* Leader hasn't filled out intake */}
              {data?.needsLeaderIntake && (
                <div className="card p-6 text-center bg-brand-amber/5 border-brand-amber/30">
                  <div className="text-3xl mb-2">📋</div>
                  <div className="font-display font-bold text-lg mb-2">Complete your intake first</div>
                  <p className="text-sm text-ink-muted mb-4">{data.message}</p>
                  {(data.leaderRole === "DIRECTOR" || data.leaderRole === "VP_SALES") ? (
                    <Link href="/director/intake" className="btn-primary">Start your intake →</Link>
                  ) : (
                    <Link href="/director/intake" className="btn-primary">Take the director intake →</Link>
                  )}
                </div>
              )}

              {/* Target hasn't completed intake */}
              {data?.needsTargetIntake && (
                <div className="card p-6 text-center bg-brand-amber/5 border-brand-amber/30">
                  <div className="text-3xl mb-2">⏳</div>
                  <div className="font-display font-bold text-lg mb-2">They haven't synthesized yet</div>
                  <p className="text-sm text-ink-muted">{data.message}</p>
                </div>
              )}

              {/* Real result */}
              {data?.result && (
                <>
                  {data.result.summary && (
                    <div className="card p-5 bg-brand-indigo/5 border-l-4 border-brand-indigo">
                      <div className="eyebrow mb-1">The dynamic</div>
                      <Markdown source={data.result.summary} />
                    </div>
                  )}

                  {data.result.alignedAreas.length > 0 && (
                    <div className="card p-5 bg-brand-emerald/5">
                      <div className="eyebrow mb-2">Where your style fits</div>
                      <ul className="space-y-1.5 text-sm">
                        {data.result.alignedAreas.map((a, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-brand-emerald font-bold">✓</span>
                            <span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {data.result.frictionPoints.length > 0 && (
                    <div className="card p-5 bg-brand-amber/5">
                      <div className="eyebrow mb-2">Friction points to watch</div>
                      <ul className="space-y-1.5 text-sm">
                        {data.result.frictionPoints.map((f, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-brand-amber font-bold">!</span>
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="card p-5">
                    <div className="eyebrow mb-3">What you need to flex</div>
                    <div className="space-y-3">
                      {(Object.keys(ADJUST_LABELS) as Array<keyof typeof ADJUST_LABELS>).map((key) => {
                        const list = data.result!.adjustments[key];
                        if (!Array.isArray(list) || list.length === 0) return null;
                        return (
                          <div key={key} className="border-l-2 border-brand-orange/40 pl-3">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span>{ADJUST_ICONS[key]}</span>
                              <div className="text-sm font-semibold">{ADJUST_LABELS[key]}</div>
                            </div>
                            <ul className="space-y-1 text-sm">
                              {list.map((item, i) => (
                                <li key={i} className="flex gap-2">
                                  <span className="text-brand-orange font-bold mt-0.5">→</span>
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <p className="meta italic text-center pt-2">
                    Comparison is generated for you only. {data.targetName} doesn't see this.
                  </p>
                </>
              )}
            </div>
          </aside>
        </>
      )}
    </>
  );
}
