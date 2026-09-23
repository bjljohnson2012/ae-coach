"use client";
import { useState, useRef, useEffect } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "What's the best coaching approach for them this quarter?",
  "How should I handle a tough deal review with them?",
  "What questions should I ask in our next 1:1?",
  "Where are they likely to plateau if I don't intervene?",
  "What's their motivation profile and how do I leverage it?",
];

export function ChatTab({ aeProfileId, aeName }: { aeProfileId: string; aeName: string }) {
  const [history, setHistory] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history, busy]);

  async function send(question: string) {
    if (!question.trim() || busy) return;
    setError(null);
    const newHistory: Msg[] = [...history, { role: "user", content: question }];
    setHistory(newHistory);
    setInput("");
    setBusy(true);
    const res = await fetch(`/api/ae/${aeProfileId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history }),  // server gets prior history; appends current question
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Chat failed.");
      return;
    }
    const j = await res.json();
    setHistory((h) => [...h, { role: "assistant", content: j.reply }]);
  }

  return (
    <div className="card flex flex-col" style={{ minHeight: 560 }}>
      <div className="px-5 py-3 border-b border-ink-softLine">
        <div className="eyebrow">Chat with {aeName}'s profile</div>
        <p className="text-xs text-ink-muted mt-1">
          Ask anything — coaching strategy, blind spots, how to handle tough conversations. Grounded in their profile + recent notes.
        </p>
      </div>

      <div ref={scrollRef} className="flex-1 px-5 py-4 overflow-y-auto space-y-3">
        {history.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">Try one of these to get started:</p>
            <div className="space-y-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="block w-full text-left text-sm px-3 py-2 rounded-brand border border-ink-softLine hover:border-brand-indigo hover:bg-brand-indigo/5 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {history.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-brand px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-brand-indigo text-white"
                  : "bg-surface-soft border border-ink-softLine"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="bg-surface-soft border border-ink-softLine rounded-brand px-3 py-2 text-sm text-ink-muted">
              Thinking…
            </div>
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-t border-ink-softLine">
        {error && <div className="text-xs text-brand-red mb-2">{error}</div>}
        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          className="flex gap-2"
        >
          <input
            type="text"
            className="input flex-1"
            placeholder={`Ask about ${aeName}…`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
          />
          <button type="submit" disabled={busy || !input.trim()} className="btn-primary text-sm">
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
