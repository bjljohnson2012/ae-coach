"use client";
import { useState, useRef, useEffect } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "How should I coach them on forecast accuracy this quarter?",
  "What's their leadership style and where will they struggle?",
  "How do I deliver tough feedback to them?",
  "Which of their reps are they over-coaching vs under-coaching?",
  "What questions should I ask in our next 1:1?",
];

export function DirectorChatTab({ directorProfileId, name }: { directorProfileId: string; name: string }) {
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
    setHistory((h) => [...h, { role: "user", content: question }]);
    setInput("");
    setBusy(true);
    const res = await fetch(`/api/director/${directorProfileId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history }),
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
        <div className="eyebrow">Chat with {name}'s profile</div>
        <p className="text-xs text-ink-muted mt-1">
          Ask anything — leadership style, forecasting tendencies, how to coach them through a tough quarter. Grounded in their profile.
        </p>
      </div>

      <div ref={scrollRef} className="flex-1 px-5 py-4 overflow-y-auto space-y-3">
        {history.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">Try one of these to get started:</p>
            <div className="space-y-2">
              {STARTERS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)}
                  className="block w-full text-left text-sm px-3 py-2 rounded-brand border border-ink-softLine hover:border-brand-indigo hover:bg-brand-indigo/5 transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {history.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-brand px-3 py-2 text-sm whitespace-pre-wrap ${
              m.role === "user" ? "bg-brand-indigo text-white" : "bg-surface-soft border border-ink-softLine"
            }`}>{m.content}</div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="bg-surface-soft border border-ink-softLine rounded-brand px-3 py-2 text-sm text-ink-muted">Thinking…</div>
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-t border-ink-softLine">
        {error && <div className="text-xs text-brand-red mb-2">{error}</div>}
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2">
          <input type="text" className="input flex-1" placeholder={`Ask about ${name}…`}
            value={input} onChange={(e) => setInput(e.target.value)} disabled={busy} />
          <button type="submit" disabled={busy || !input.trim()} className="btn-primary text-sm">Send</button>
        </form>
      </div>
    </div>
  );
}
