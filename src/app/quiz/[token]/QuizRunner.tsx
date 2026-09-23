"use client";
import { useEffect, useState } from "react";

interface Question {
  id: string;
  text: string;
  questionType: "LONG_FORM" | "MULTIPLE_CHOICE" | "LIKERT" | "SLIDER";
  optionsJson?: any;
  category: string;
}

interface QuizMeta {
  id: string;
  title: string;
  description: string | null;
  status: string;
  expiresAt: string;
  sentBy: string;
  orgName: string;
  recipientName: string | null;
}

export function QuizRunner({ token }: { token: string }) {
  const [quiz, setQuiz] = useState<QuizMeta | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/quiz/${token}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || "Quiz unavailable");
        }
        return r.json();
      })
      .then((j) => {
        setQuiz(j.quiz);
        setQuestions(j.questions);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function submit() {
    setSubmitting(true);
    const payload = Object.entries(answers).map(([questionId, value]) => ({ questionId, value }));
    const res = await fetch(`/api/quiz/${token}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: payload }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Submit failed");
      return;
    }
    setDone(true);
  }

  if (loading) {
    return <Wrapper><div className="text-center text-ink-muted text-sm">Loading quiz…</div></Wrapper>;
  }
  if (error) {
    return (
      <Wrapper>
        <div className="card p-8 text-center">
          <div className="font-display text-xl font-bold text-brand-red mb-2">Quiz unavailable</div>
          <p className="text-sm text-ink-muted">{error}</p>
        </div>
      </Wrapper>
    );
  }
  if (done) {
    return (
      <Wrapper>
        <div className="card p-8 text-center">
          <div className="text-5xl mb-3">✓</div>
          <div className="font-display text-2xl font-bold mb-2">Thanks, {quiz?.recipientName?.split(" ")[0] ?? "all done"}!</div>
          <p className="text-sm text-ink-muted">Your responses are in. Your coach will review them and follow up.</p>
        </div>
      </Wrapper>
    );
  }
  if (!quiz || questions.length === 0) {
    return <Wrapper><div className="text-center text-ink-muted text-sm">No questions.</div></Wrapper>;
  }

  const q = questions[idx];
  const total = questions.length;
  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === total;

  function setAnswer(value: any) {
    setAnswers((a) => ({ ...a, [q.id]: value }));
  }

  function next() {
    if (idx < total - 1) setIdx(idx + 1);
  }
  function prev() {
    if (idx > 0) setIdx(idx - 1);
  }

  return (
    <Wrapper>
      <div className="mb-5">
        <div className="text-xs uppercase tracking-wider text-ink-muted mb-1">{quiz.orgName} · sent by {quiz.sentBy}</div>
        <h1 className="font-display text-2xl font-bold">{quiz.title}</h1>
        {quiz.description && <p className="text-sm text-ink-muted mt-1">{quiz.description}</p>}
      </div>

      {/* Progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="meta">Question {idx + 1} of {total}</span>
          <span className="meta">{answeredCount}/{total} answered</span>
        </div>
        <div className="h-1.5 bg-ink-softLine rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-orange transition-all"
            style={{ width: `${(answeredCount / total) * 100}%` }}
          />
        </div>
      </div>

      <div className="card p-6">
        <div className="text-xs text-ink-muted mb-2">{q.category.replace(/_/g, " ")}</div>
        <div className="font-display text-lg font-semibold mb-4">{q.text}</div>

        <QuestionInput question={q} value={answers[q.id]} onChange={setAnswer} />
      </div>

      <div className="flex justify-between mt-4 gap-2 flex-wrap">
        <button onClick={prev} disabled={idx === 0} className="btn-ghost">← Previous</button>
        <div className="flex gap-2">
          {idx < total - 1 ? (
            <button onClick={next} disabled={!answers[q.id]} className="btn-primary">Next →</button>
          ) : (
            <button onClick={submit} disabled={!allAnswered || submitting} className="btn-primary">
              {submitting ? "Submitting…" : "Submit quiz"}
            </button>
          )}
        </div>
      </div>

      {!allAnswered && idx === total - 1 && (
        <p className="text-xs text-brand-amber text-right mt-2">
          {total - answeredCount} unanswered — go back to fill them in.
        </p>
      )}
    </Wrapper>
  );
}

function QuestionInput({ question, value, onChange }: { question: Question; value: any; onChange: (v: any) => void }) {
  if (question.questionType === "MULTIPLE_CHOICE") {
    const opts = (question.optionsJson as any[]) ?? [];
    return (
      <ul className="space-y-2">
        {opts.map((o) => (
          <li key={o.value}>
            <label className={`block px-4 py-3 rounded-brand border cursor-pointer transition-all ${
              value === o.value
                ? "border-brand-indigo bg-brand-indigo/10"
                : "border-ink-softLine hover:border-ink-line"
            }`}>
              <input
                type="radio"
                name={question.id}
                value={o.value}
                checked={value === o.value}
                onChange={() => onChange(o.value)}
                className="mr-2"
              />
              {o.label}
            </label>
          </li>
        ))}
      </ul>
    );
  }
  if (question.questionType === "LIKERT") {
    const labels = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"];
    return (
      <div className="grid grid-cols-5 gap-2">
        {labels.map((label, i) => {
          const v = i + 1;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              className={`px-3 py-2 rounded-brand border text-xs font-semibold transition-all ${
                value === v
                  ? "border-brand-indigo bg-brand-indigo text-white"
                  : "border-ink-softLine hover:border-ink-line"
              }`}
            >
              <div className="text-lg">{v}</div>
              <div className="text-[10px] mt-0.5">{label}</div>
            </button>
          );
        })}
      </div>
    );
  }
  if (question.questionType === "SLIDER") {
    const v = typeof value === "number" ? value : 50;
    return (
      <div>
        <input type="range" min={0} max={100} value={v} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
        <div className="text-center font-mono mt-2">{v}</div>
      </div>
    );
  }
  // LONG_FORM
  return (
    <textarea
      className="input min-h-[140px]"
      placeholder="Type your answer…"
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-soft py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {children}
      </div>
    </div>
  );
}
