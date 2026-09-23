"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface AnswerRow {
  id: string;
  questionId: string;
  value: any;
  question: {
    text: string;
    category: string;
    questionType: string;
    optionsJson: any;
  };
}

interface IntakeSet {
  id: string;
  version: number;
  status: string;
  startedAt: Date | string;
  completedAt: Date | string | null;
  answers: AnswerRow[];
}

interface Quiz {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  status: string;
  sentAt: Date | string;
  completedAt: Date | string | null;
  expiresAt: Date | string;
  questionIds: any;
  sentBy: { name: string };
  answerSet: {
    answers: AnswerRow[];
  } | null;
}

interface PendingRetake {
  id: string;
  status: string;
  adHocQuizId: string | null;
  answerSetId: string | null;
  decidedBy?: { name: string } | null;
}

const LIKERT_LABELS: Record<number, string> = {
  1: "Strongly disagree", 2: "Disagree", 3: "Neutral", 4: "Agree", 5: "Strongly agree",
};

function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

function renderAnswer(a: AnswerRow): string {
  const v = a.value;
  if (v === null || v === undefined) return "—";
  if (a.question.questionType === "MULTIPLE_CHOICE" && Array.isArray(a.question.optionsJson)) {
    const value = (v && typeof v === "object" ? v.value : v);
    const opt = a.question.optionsJson.find((o: any) => o?.value === value);
    if (opt) return `"${opt.label}"`;
    return String(value);
  }
  if (a.question.questionType === "LIKERT") {
    const n = typeof v === "object" ? (v?.value ?? v?.score) : v;
    const num = typeof n === "number" ? n : Number(n);
    if (!isNaN(num)) return `${LIKERT_LABELS[num] ?? num} (${num}/5)`;
  }
  if (a.question.questionType === "SLIDER") {
    const n = typeof v === "object" ? (v?.value ?? v?.score) : v;
    const num = typeof n === "number" ? n : Number(n);
    if (!isNaN(num)) return `${num}/100`;
  }
  if (typeof v === "string") return v.length > 240 ? v.slice(0, 240) + "…" : v;
  return JSON.stringify(v).slice(0, 200);
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: "badge-warning",
  IN_PROGRESS: "badge-warning",
  COMPLETED: "badge-success",
  EXPIRED: "badge-neutral",
  CANCELLED: "badge-neutral",
};

export function IntakeAndQuizzesView({
  intakeSets,
  quizzes,
  pendingRetakes,
  canRequestRetake,
  canApproveRetakes,
}: {
  intakeSets: IntakeSet[];
  quizzes: Quiz[];
  pendingRetakes: PendingRetake[];
  canRequestRetake: boolean;
  canApproveRetakes: boolean;
}) {
  const router = useRouter();
  const [openIntake, setOpenIntake] = useState<Record<string, boolean>>({});
  const [openQuiz, setOpenQuiz] = useState<Record<string, boolean>>({});
  const [retakeDialog, setRetakeDialog] = useState<{ kind: "quiz" | "intake"; id: string; title: string } | null>(null);
  const [reason, setReason] = useState("");
  const [submittingRetake, setSubmittingRetake] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function retakeStatusFor(quizOrSetId: string, kind: "quiz" | "intake"): PendingRetake | null {
    return pendingRetakes.find((r) =>
      kind === "quiz" ? r.adHocQuizId === quizOrSetId : r.answerSetId === quizOrSetId
    ) ?? null;
  }

  async function submitRetake() {
    if (!retakeDialog) return;
    setSubmittingRetake(true);
    const body = retakeDialog.kind === "quiz"
      ? { adHocQuizId: retakeDialog.id, reason: reason.trim() || undefined }
      : { answerSetId: retakeDialog.id, reason: reason.trim() || undefined };
    const res = await fetch("/api/retakes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSubmittingRetake(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setMsg({ kind: "err", text: j.error || "Could not submit." });
      return;
    }
    setMsg({ kind: "ok", text: "Retake request sent. Your coach will review." });
    setRetakeDialog(null);
    setReason("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div className={`text-sm rounded-brand px-3 py-2 border ${
          msg.kind === "ok"
            ? "text-brand-emerald bg-brand-emerald/5 border-brand-emerald/20"
            : "text-brand-red bg-brand-red/5 border-brand-red/20"
        }`}>
          {msg.text}
        </div>
      )}

      {/* Intake submissions */}
      <section className="card overflow-hidden">
        <header className="px-5 py-3 border-b border-ink-softLine bg-surface-soft">
          <div className="font-display font-semibold">Intake submissions</div>
          <div className="meta">{intakeSets.filter((s) => s.status === "COMPLETED").length} completed · click a row to expand</div>
        </header>
        {intakeSets.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-muted">No intake yet.</div>
        ) : (
          <ul className="divide-y divide-ink-softLine">
            {intakeSets.map((s) => {
              const expanded = openIntake[s.id];
              const retake = retakeStatusFor(s.id, "intake");
              return (
                <li key={s.id}>
                  <div className="px-5 py-3 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setOpenIntake((o) => ({ ...o, [s.id]: !o[s.id] }))}
                      className="flex-1 flex items-center gap-3 text-left min-w-0"
                    >
                      <svg
                        className={`w-4 h-4 text-ink-muted transition-transform ${expanded ? "rotate-90" : ""}`}
                        fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"
                      >
                        <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">Intake v{s.version}</div>
                        <div className="meta">
                          {s.status === "COMPLETED"
                            ? `Completed ${fmtDate(s.completedAt)} · ${s.answers.length} answers`
                            : `${s.status.toLowerCase()} · started ${fmtDate(s.startedAt)}`}
                        </div>
                      </div>
                      <span className={STATUS_COLOR[s.status] ?? "badge-neutral"}>{s.status.toLowerCase()}</span>
                    </button>
                    {canRequestRetake && s.status === "COMPLETED" && (
                      retake?.status === "PENDING" ? (
                        <span className="text-xs text-brand-amber whitespace-nowrap">⏳ Retake requested</span>
                      ) : retake?.status === "APPROVED" ? (
                        <span className="text-xs text-brand-emerald whitespace-nowrap">✓ Retake approved</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setRetakeDialog({ kind: "intake", id: s.id, title: `Intake v${s.version}` })}
                          className="btn-ghost text-xs whitespace-nowrap"
                        >
                          ↺ Request retake
                        </button>
                      )
                    )}
                  </div>
                  {expanded && s.answers.length > 0 && (
                    <ul className="px-5 pb-4 pt-1 space-y-2 border-t border-ink-softLine/60 bg-surface-soft/30">
                      {s.answers.map((a) => (
                        <li key={a.id} className="text-sm border-l-2 border-brand-indigo/30 pl-2">
                          <div className="text-xs text-ink-muted">{a.question.category} · {a.question.questionType}</div>
                          <div className="font-medium">{a.question.text}</div>
                          <div className="meta italic mt-0.5">{renderAnswer(a)}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Ad-hoc + recurring quizzes */}
      <section className="card overflow-hidden">
        <header className="px-5 py-3 border-b border-ink-softLine bg-surface-soft">
          <div className="font-display font-semibold">Quizzes</div>
          <div className="meta">{quizzes.length} total · click a row to expand</div>
        </header>
        {quizzes.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-muted">No quizzes sent yet.</div>
        ) : (
          <ul className="divide-y divide-ink-softLine">
            {quizzes.map((q) => {
              const expanded = openQuiz[q.id];
              const retake = retakeStatusFor(q.id, "quiz");
              const answers = q.answerSet?.answers ?? [];
              return (
                <li key={q.id}>
                  <div className="px-5 py-3 flex items-center gap-3 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setOpenQuiz((o) => ({ ...o, [q.id]: !o[q.id] }))}
                      className="flex-1 flex items-center gap-3 text-left min-w-0"
                    >
                      <svg
                        className={`w-4 h-4 text-ink-muted transition-transform ${expanded ? "rotate-90" : ""}`}
                        fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"
                      >
                        <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{q.title}</div>
                        <div className="meta">
                          {q.kind.replace(/_/g, " ").toLowerCase()} · sent by {q.sentBy.name} · {fmtDate(q.sentAt)}
                          {q.status === "COMPLETED" && ` · completed ${fmtDate(q.completedAt)}`}
                        </div>
                      </div>
                      <span className={STATUS_COLOR[q.status] ?? "badge-neutral"}>{q.status.toLowerCase()}</span>
                    </button>
                    {canRequestRetake && q.status === "COMPLETED" && (
                      retake?.status === "PENDING" ? (
                        <span className="text-xs text-brand-amber whitespace-nowrap">⏳ Retake requested</span>
                      ) : retake?.status === "APPROVED" ? (
                        <span className="text-xs text-brand-emerald whitespace-nowrap">✓ Retake approved</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setRetakeDialog({ kind: "quiz", id: q.id, title: q.title })}
                          className="btn-ghost text-xs whitespace-nowrap"
                        >
                          ↺ Request retake
                        </button>
                      )
                    )}
                  </div>
                  {expanded && (
                    <div className="px-5 pb-4 pt-1 border-t border-ink-softLine/60 bg-surface-soft/30 space-y-2">
                      {q.description && <p className="text-sm italic text-ink-muted">{q.description}</p>}
                      {answers.length === 0 ? (
                        <p className="text-sm text-ink-muted italic">No answers recorded yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {answers.map((a) => (
                            <li key={a.id} className="text-sm border-l-2 border-brand-orange/40 pl-2">
                              <div className="text-xs text-ink-muted">{a.question.category} · {a.question.questionType}</div>
                              <div className="font-medium">{a.question.text}</div>
                              <div className="meta italic mt-0.5">{renderAnswer(a)}</div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Retake dialog */}
      {retakeDialog && (
        <>
          <div className="fixed inset-0 bg-brand-navy/60 z-30" onClick={() => setRetakeDialog(null)} />
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-none">
            <div className="card max-w-md w-full p-6 pointer-events-auto animate-slideUp">
              <h2 className="h-section">Request retake — {retakeDialog.title}</h2>
              <p className="text-sm text-ink-muted mt-2 mb-4">
                Your coach will be notified and can approve or deny. If approved, you'll get a fresh link by email.
              </p>
              <label className="label">Why do you want to retake? (optional)</label>
              <textarea
                className="input min-h-[100px]"
                placeholder="e.g., I rushed it the first time. Want to give it more thought."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setRetakeDialog(null)} className="btn-ghost">Cancel</button>
                <button onClick={submitRetake} disabled={submittingRetake} className="btn-primary">
                  {submittingRetake ? "Submitting…" : "Send request"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
