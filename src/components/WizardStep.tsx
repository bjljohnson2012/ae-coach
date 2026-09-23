"use client";
import type { Question } from "@prisma/client";

interface Props {
  question: Question;
  value: any;
  onChange: (v: any) => void;
}

export function WizardStep({ question, value, onChange }: Props) {
  const opts = (question.optionsJson as any[]) ?? [];

  return (
    <div className="space-y-4">
      <div className="text-lg font-medium leading-snug">{question.text}</div>

      {question.questionType === "LONG_FORM" && (
        <textarea
          className="input min-h-[120px]"
          placeholder="Take your time — there are no wrong answers."
          value={value?.text ?? ""}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      )}

      {question.questionType === "MULTIPLE_CHOICE" && (
        <div className="space-y-2">
          {opts.map((opt: any, i: number) => {
            const selected = value?.choice === opt.value;
            return (
              <button
                key={i}
                type="button"
                onClick={() => onChange({ choice: opt.value, label: opt.label, tags: opt.tags ?? [] })}
                className={`w-full text-left px-4 py-3 rounded-lg border transition ${
                  selected ? "border-accent bg-orange-50" : "border-neutral-200 hover:border-neutral-400"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {question.questionType === "LIKERT" && (
        <div className="flex gap-2 justify-between">
          {[1, 2, 3, 4, 5].map((n) => {
            const selected = value?.scale === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => onChange({ scale: n })}
                className={`flex-1 py-3 rounded-lg border font-medium transition ${
                  selected ? "border-accent bg-orange-50" : "border-neutral-200 hover:border-neutral-400"
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>
      )}

      {question.questionType === "SLIDER" && (
        <div>
          <input
            type="range"
            min={0}
            max={100}
            value={value?.scale ?? 50}
            onChange={(e) => onChange({ scale: Number(e.target.value) })}
            className="w-full"
          />
          <div className="text-center text-sm text-neutral-500 mt-1">{value?.scale ?? 50}</div>
        </div>
      )}
    </div>
  );
}
