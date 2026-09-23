import { prisma } from "@/lib/prisma";
import { Markdown } from "@/components/Markdown";

/**
 * Reasoning tab — director-only deep dive into everything that's shaped this AE's
 * profile and scores. Server-rendered, fully reactive to fresh data.
 *
 * Shows:
 *   - Score history (per-skill timeline)
 *   - All AnswerSets with full Q&A
 *   - All DirectorReviews with answers
 *   - All CoachingNotes
 *   - All OneOnOnePreps
 *   - All Tasks
 *   - All AdHocQuizzes
 *   - QuarterlyPerformance
 */
export async function ReasoningTab({ aeProfileId }: { aeProfileId: string }) {
  const [profile, answerSets, reviews, notes, preps, tasks, quizzes, perf, scoreHistory] = await Promise.all([
    prisma.aeProfile.findUnique({
      where: { id: aeProfileId },
      include: { user: { select: { name: true, email: true } }, skillScores: true },
    }),
    prisma.answerSet.findMany({
      where: { aeProfileId },
      orderBy: { startedAt: "desc" },
      include: {
        answers: {
          include: { question: { select: { text: true, questionType: true, category: true, tagsJson: true, optionsJson: true } } },
        },
      },
    }),
    prisma.directorReview.findMany({
      where: { aeProfileId },
      orderBy: { monthOf: "desc" },
      include: {
        director: { select: { name: true } },
        answers: { include: { question: { select: { text: true } } } },
      },
    }),
    prisma.coachingNote.findMany({
      where: { aeProfileId },
      orderBy: { createdAt: "desc" },
      include: { director: { select: { name: true } } },
    }),
    prisma.oneOnOnePrep.findMany({
      where: { aeProfileId },
      orderBy: { createdAt: "desc" },
      include: { preparedBy: { select: { name: true } } },
    }),
    prisma.task.findMany({
      where: { aeProfileId },
      orderBy: { createdAt: "desc" },
      include: { createdBy: { select: { name: true } } },
    }),
    prisma.adHocQuiz.findMany({
      where: { aeProfileId },
      orderBy: { sentAt: "desc" },
      include: { sentBy: { select: { name: true } } },
    }),
    prisma.quarterlyPerformance.findMany({
      where: { aeProfileId },
      orderBy: [{ year: "desc" }, { quarter: "desc" }],
    }),
    prisma.skillScoreHistory.findMany({
      where: { aeProfileId },
      orderBy: { recordedAt: "desc" },
      take: 100,
    }),
  ]);

  if (!profile) return <div className="text-sm text-ink-muted">Profile not found.</div>;

  const reasoningSummary = (profile as any).reasoningSummary as string | null;
  const reasoningSummaryAt = (profile as any).reasoningSummaryAt as Date | null;

  return (
    <div className="space-y-4">
      <div className="card p-4 bg-brand-amber/5 border border-brand-amber/30">
        <div className="text-xs font-semibold text-brand-amber uppercase tracking-wider mb-1">Director-only</div>
        <p className="text-sm text-ink">
          Full visibility into every signal shaping {profile.user.name}'s scores. Use this to audit AI synthesis,
          spot trends, and prep for hard conversations. AEs do not see this tab.
        </p>
      </div>

      {reasoningSummary && (
        <div className="card p-5 bg-gradient-to-br from-brand-indigo/5 to-transparent border-l-4 border-brand-indigo">
          <div className="flex items-center justify-between mb-2">
            <div className="eyebrow">How the AI thinks about {profile.user.name.split(" ")[0]}</div>
            {reasoningSummaryAt && (
              <span className="meta">refreshed {new Date(reasoningSummaryAt).toLocaleDateString()}</span>
            )}
          </div>
          <Markdown source={reasoningSummary} />
        </div>
      )}

      {/* Current scores */}
      <Section title={`Current skill scores (${profile.skillScores.length})`}>
        {profile.skillScores.length === 0 ? (
          <Empty>No scores yet — AE may not have completed intake.</Empty>
        ) : (
          <ul className="text-sm space-y-1">
            {profile.skillScores.map((s) => (
              <li key={s.id} className="flex justify-between gap-3">
                <span className="font-mono">{s.category}</span>
                <span>{s.score} (level {s.level}, {s.source})</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Quarterly performance */}
      <Section title={`Quarterly performance (${perf.length})`}>
        {perf.length === 0 ? <Empty>No quarters logged.</Empty> : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-ink-muted">
              <tr><th className="text-left py-1">Quarter</th><th className="text-right">Quota</th><th className="text-right">Attained</th><th className="text-right">%</th></tr>
            </thead>
            <tbody>
              {perf.map((p) => {
                const pct = p.quotaCents && p.attainedCents !== null ? Math.round((p.attainedCents! / p.quotaCents) * 100) : null;
                return (
                  <tr key={p.id} className="border-t border-ink-softLine">
                    <td className="py-1 font-semibold">Q{p.quarter} {p.year}</td>
                    <td className="text-right font-mono">{p.quotaCents !== null ? `$${(p.quotaCents! / 100).toLocaleString()}` : "—"}</td>
                    <td className="text-right font-mono">{p.attainedCents !== null ? `$${(p.attainedCents! / 100).toLocaleString()}` : "—"}</td>
                    <td className="text-right font-mono">{pct === null ? "—" : `${pct}%`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      {/* Score history */}
      <Section title={`Score history (${scoreHistory.length} events)`}>
        {scoreHistory.length === 0 ? <Empty>No history events yet.</Empty> : (
          <ul className="text-sm space-y-1 max-h-64 overflow-y-auto">
            {scoreHistory.map((h) => (
              <li key={h.id} className="flex justify-between gap-3 border-b border-ink-softLine/40 py-1">
                <span><span className="font-mono">{h.category}</span> · {h.score}</span>
                <span className="meta">{h.source} · {new Date(h.recordedAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* AnswerSets */}
      <Section title={`Intake / quiz responses (${answerSets.length} sets)`}>
        {answerSets.length === 0 ? <Empty>No answer sets yet.</Empty> : (
          <div className="space-y-3">
            {answerSets.map((s) => (
              <details key={s.id} className="border border-ink-softLine rounded-brand">
                <summary className="px-3 py-2 cursor-pointer flex items-center justify-between hover:bg-surface-soft">
                  <span className="text-sm font-medium">
                    {s.status} · v{s.version} · {s.answers.length} answers
                  </span>
                  <span className="meta">
                    {s.completedAt ? `completed ${new Date(s.completedAt).toLocaleDateString()}` : `started ${new Date(s.startedAt).toLocaleDateString()}`}
                  </span>
                </summary>
                <ul className="px-3 pb-3 pt-1 space-y-2 text-sm">
                  {s.answers.map((a) => (
                    <li key={a.id} className="border-l-2 border-brand-indigo/30 pl-2">
                      <div className="text-xs text-ink-muted">{a.question.category} · {a.question.questionType}</div>
                      <div className="font-medium">{a.question.text}</div>
                      <div className="meta italic mt-0.5">{renderAnswerValue(a.value, a.question.questionType, a.question.optionsJson)}</div>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}
      </Section>

      {/* Director reviews */}
      <Section title={`Monthly reviews (${reviews.length})`}>
        {reviews.length === 0 ? <Empty>No reviews yet.</Empty> : (
          <div className="space-y-3">
            {reviews.map((r) => (
              <details key={r.id} className="border border-ink-softLine rounded-brand">
                <summary className="px-3 py-2 cursor-pointer flex items-center justify-between hover:bg-surface-soft">
                  <span className="text-sm font-medium">
                    {new Date(r.monthOf).toLocaleDateString(undefined, { year: "numeric", month: "long" })} · {r.director.name}
                  </span>
                  <span className="meta">{r.status}</span>
                </summary>
                <div className="px-3 pb-3 pt-1 text-sm">
                  {r.summary && <p className="italic mb-2">{r.summary}</p>}
                  <ul className="space-y-1.5">
                    {r.answers.map((a) => (
                      <li key={a.id} className="border-l-2 border-brand-orange/40 pl-2">
                        <div className="font-medium">{a.question.text}</div>
                        <div className="meta italic">{renderAnswerValue(a.value, "TEXT")}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            ))}
          </div>
        )}
      </Section>

      {/* Coaching notes */}
      <Section title={`Coaching notes (${notes.length})`}>
        {notes.length === 0 ? <Empty>No notes yet.</Empty> : (
          <ul className="space-y-2 text-sm">
            {notes.map((n) => (
              <li key={n.id} className="border-l-2 border-brand-emerald/50 pl-2">
                <div className="meta">{new Date(n.createdAt).toLocaleDateString()} · {n.director.name} {n.visibleToAe ? "· visible to AE" : "· private"}</div>
                <p className="whitespace-pre-wrap mt-0.5">{n.content}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 1:1 preps */}
      <Section title={`1:1 prep sessions (${preps.length})`}>
        {preps.length === 0 ? <Empty>No prep docs yet.</Empty> : (
          <ul className="space-y-2 text-sm">
            {preps.map((p) => (
              <li key={p.id} className="border-l-2 border-brand-indigo/50 pl-2">
                <div className="meta">{new Date(p.createdAt).toLocaleDateString()} · {p.preparedBy.name} · {p.modelUsed ?? "—"}</div>
                <div className="font-medium">{p.prepDocFilename || "Pasted text"}</div>
                {(p.generatedJson as any)?.summary && (
                  <p className="text-ink-slate mt-0.5">{(p.generatedJson as any).summary}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Tasks */}
      <Section title={`Tasks (${tasks.length})`}>
        {tasks.length === 0 ? <Empty>No tasks yet.</Empty> : (
          <ul className="space-y-1 text-sm max-h-64 overflow-y-auto">
            {tasks.map((t) => (
              <li key={t.id} className="flex justify-between gap-3 border-b border-ink-softLine/40 py-1">
                <span className={t.status === "DONE" ? "line-through text-ink-muted" : ""}>{t.title}</span>
                <span className="meta">{t.status} · {t.createdBy.name}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Ad-hoc quizzes */}
      <Section title={`Ad-hoc quizzes sent (${quizzes.length})`}>
        {quizzes.length === 0 ? <Empty>No quizzes sent yet.</Empty> : (
          <ul className="space-y-1 text-sm">
            {quizzes.map((q) => (
              <li key={q.id} className="flex justify-between gap-3 border-b border-ink-softLine/40 py-1">
                <span className="font-medium">{q.title}</span>
                <span className="meta">{q.status} · {q.sentBy.name} · {new Date(q.sentAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="card overflow-hidden" open>
      <summary className="px-5 py-3 border-b border-ink-softLine bg-surface-soft cursor-pointer flex items-center justify-between">
        <span className="font-display font-semibold">{title}</span>
        <svg className="w-4 h-4 text-ink-muted transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="p-5">{children}</div>
    </details>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-ink-muted italic">{children}</p>;
}

function renderAnswerValue(value: any, type: string, options?: any): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.length > 280 ? value.slice(0, 280) + "…" : value;
  if (typeof value === "number") return String(value);
  if (type === "MULTIPLE_CHOICE" && options && Array.isArray(options)) {
    const v = (value && typeof value === "object" ? value.value : value);
    const opt = options.find((o: any) => o.value === v);
    if (opt) return `"${opt.label}"`;
  }
  if (typeof value === "object") {
    const v = value.value ?? value.score ?? value.text;
    if (v !== undefined) return String(v);
    return JSON.stringify(value).slice(0, 200);
  }
  return String(value);
}
