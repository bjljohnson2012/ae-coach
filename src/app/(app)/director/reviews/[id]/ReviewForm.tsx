"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { WizardStep } from "@/components/WizardStep";

interface Q {
  id: string;
  text: string;
  questionType: "LONG_FORM" | "MULTIPLE_CHOICE" | "LIKERT" | "SLIDER";
  optionsJson: any;
}

export function ReviewForm({
  directorReviewId,
  completed,
  summary,
  questions,
  existingAnswers,
}: {
  directorReviewId: string;
  completed: boolean;
  summary: string | null;
  questions: Q[];
  existingAnswers: Record<string, any>;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, any>>(existingAnswers);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (completed) {
    return (
      <div className="card p-5 bg-green-50 border-green-200">
        <h2 className="font-medium">Review submitted</h2>
        {summary && <p className="text-sm text-neutral-700 mt-2 whitespace-pre-wrap">{summary}</p>}
      </div>
    );
  }

  const allAnswered = questions.every((q) => answers[q.id] != null);

  async function submit() {
    setSaving(true); setError(null);
    const res = await fetch("/api/director-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        directorReviewId,
        answers: questions.map((q) => ({ questionId: q.id, value: answers[q.id] })),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Submit failed.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {questions.map((q) => (
        <div key={q.id} className="card p-5">
          <WizardStep
            question={q as any}
            value={answers[q.id]}
            onChange={(v) => setAnswers({ ...answers, [q.id]: v })}
          />
        </div>
      ))}
      {error && <div className="text-sm text-red-600">{error}</div>}
      <button className="btn-accent" disabled={!allAnswered || saving} onClick={submit}>
        {saving ? "Scoring & adjusting…" : "Submit review"}
      </button>
    </div>
  );
}
