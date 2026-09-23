import { prisma } from "@/lib/prisma";

/**
 * Director Reasoning tab — VP/admin-only deep dive.
 * Mirrors the AE ReasoningTab pattern.
 */
export async function DirectorReasoningTab({ directorProfileId }: { directorProfileId: string }) {
  const [profile, answerSets, notes, preps, quizzes] = await Promise.all([
    prisma.directorProfile.findUnique({
      where: { id: directorProfileId },
      include: { user: { select: { name: true, email: true } }, skillScores: true },
    }),
    prisma.answerSet.findMany({
      where: { directorProfileId },
      orderBy: { startedAt: "desc" },
      include: {
        answers: {
          include: { question: { select: { text: true, questionType: true, category: true, tagsJson: true, optionsJson: true } } },
        },
      },
    }),
    // Coaching notes are AE-keyed; surface notes the director has authored ABOUT others (their coaching footprint)
    prisma.coachingNote.findMany({
      where: { directorId: { in: profileUserIdSubquery(directorProfileId) ? undefined : undefined } },
      take: 0,
    }).catch(() => []),
    prisma.oneOnOnePrep.findMany({
      where: { directorProfileId },
      orderBy: { createdAt: "desc" },
      include: { preparedBy: { select: { name: true } } },
    }),
    prisma.adHocQuiz.findMany({
      where: { directorProfileId },
      orderBy: { sentAt: "desc" },
      include: { sentBy: { select: { name: true } } },
    }),
  ]);

  if (!profile) return <div className="text-sm text-ink-muted">Profile not found.</div>;

  // Coaching notes the director has WRITTEN about their AEs (their coaching footprint)
  const ownNotes = await prisma.coachingNote.findMany({
    where: { directorId: profile.userId },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { aeProfile: { include: { user: { select: { name: true } } } } },
  });

  return (
    <div className="space-y-4">
      <div className="card p-4 bg-brand-amber/5 border border-brand-amber/30">
        <div className="text-xs font-semibold text-brand-amber uppercase tracking-wider mb-1">Leader-only</div>
        <p className="text-sm text-ink">
          Full visibility into every signal shaping {profile.user.name}'s leadership profile + a window into their coaching footprint.
          {profile.user.name} does not see this tab.
        </p>
      </div>

      <Section title={`Current leadership skill scores (${profile.skillScores.length})`}>
        {profile.skillScores.length === 0 ? (
          <Empty>No scores yet — director may not have completed leadership intake.</Empty>
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

      <Section title={`Leadership intake responses (${answerSets.length} sets)`}>
        {answerSets.length === 0 ? <Empty>No leadership intake yet.</Empty> : (
          <div className="space-y-3">
            {answerSets.map((s) => (
              <details key={s.id} className="border border-ink-softLine rounded-brand">
                <summary className="px-3 py-2 cursor-pointer flex items-center justify-between hover:bg-surface-soft">
                  <span className="text-sm font-medium">{s.status} · v{s.version} · {s.answers.length} answers</span>
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

      <Section title={`Coaching footprint — notes written about their AEs (${ownNotes.length})`}>
        {ownNotes.length === 0 ? <Empty>This director hasn't written coaching notes yet.</Empty> : (
          <ul className="space-y-2 text-sm">
            {ownNotes.map((n) => (
              <li key={n.id} className="border-l-2 border-brand-emerald/50 pl-2">
                <div className="meta">{new Date(n.createdAt).toLocaleDateString()} · about {n.aeProfile.user.name}</div>
                <p className="whitespace-pre-wrap mt-0.5">{n.content}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`1:1 prep sessions received (${preps.length})`}>
        {preps.length === 0 ? <Empty>No 1:1 prep docs yet.</Empty> : (
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

      <Section title={`Ad-hoc quizzes received (${quizzes.length})`}>
        {quizzes.length === 0 ? <Empty>No quizzes received yet.</Empty> : (
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

function profileUserIdSubquery(_id: string) { return false; }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="card overflow-hidden" open>
      <summary className="px-5 py-3 border-b border-ink-softLine bg-surface-soft cursor-pointer flex items-center justify-between">
        <span className="font-display font-semibold">{title}</span>
        <svg className="w-4 h-4 text-ink-muted" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
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
