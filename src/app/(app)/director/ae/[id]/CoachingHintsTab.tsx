"use client";
import { useEffect, useState } from "react";
import { Markdown } from "@/components/Markdown";
import { CompareButton } from "./CompareButton";

interface HintsPayload {
  hints: {
    personality: string[];
    salesStyle: string[];
    communication: string[];
    motivations: string[];
    strengths: string[];
    weaknesses: string[];
  } | null;
  reasoningSummary: string | null;
  coachingHintsAt: string | null;
  latestSignalAt: string | null;
  regenerated: boolean;
  empty?: boolean;
  reason?: string;
  target: { name: string };
}

const FIELD_LABELS: Record<string, string> = {
  personality: "Personality",
  salesStyle: "Sales / Leadership style",
  communication: "Communication",
  motivations: "Motivations",
  strengths: "Strengths to amplify",
  weaknesses: "Growth areas",
};

const FIELD_ICONS: Record<string, string> = {
  personality: "🧠",
  salesStyle: "🎯",
  communication: "💬",
  motivations: "⚡",
  strengths: "✨",
  weaknesses: "📈",
};

export function CoachingHintsTab({ userId, aeProfileId }: { userId: string; aeProfileId?: string }) {
  const [data, setData] = useState<HintsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  async function saveSection(key: string, label: string, items: string[]) {
    if (!aeProfileId || items.length === 0) return;
    setSavingKey(key);
    setSavedKey(null);
    const content = `**Coaching hints — ${label}**\n\n${items.map((h) => `- ${h}`).join("\n")}`;
    const res = await fetch("/api/coaching-notes/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aeProfileIds: [aeProfileId], content, visibleToAe: false }),
    });
    setSavingKey(null);
    if (res.ok) {
      setSavedKey(key);
      setTimeout(() => setSavedKey(null), 2500);
    }
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${userId}/coaching-hints`);
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

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/users/${userId}/coaching-hints`, { method: "POST" });
      if (res.ok) setData(await res.json());
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => { void load(); }, [userId]);

  if (loading) return <div className="card p-8 text-center text-sm text-ink-muted">Loading hints…</div>;
  if (error) return <div className="card p-8 text-center text-sm text-brand-red">{error}</div>;
  if (!data) return null;
  if (data.empty) {
    return (
      <div className="card p-8 text-center">
        <div className="text-sm text-ink-muted">{data.reason ?? "No hints available yet."}</div>
      </div>
    );
  }

  // Explicit ordered list of hint fields — never iterate Object.keys
  // (the payload also contains reasoningSummary as a string, which would
  // crash if rendered as a string[]).
  const HINT_KEYS = ["personality", "salesStyle", "communication", "motivations", "strengths", "weaknesses"] as const;
  const haveHints = !!data.hints && HINT_KEYS.some((k) => {
    const list = (data.hints as any)?.[k];
    return Array.isArray(list) && list.length > 0;
  });

  return (
    <div className="space-y-4">
      <div className="card p-4 bg-gradient-to-br from-brand-orange/10 to-brand-amber/5 border border-brand-orange/30">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-xs font-semibold text-brand-orange uppercase tracking-wider">
              Leader-only · how to coach {data.target.name.split(" ")[0]}
            </div>
            <div className="meta mt-0.5">
              {data.coachingHintsAt
                ? `Generated ${new Date(data.coachingHintsAt).toLocaleDateString()}`
                : "Not generated yet"}
              {data.regenerated && " · just refreshed"}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <CompareButton targetUserId={userId} />
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="btn-ghost text-xs"
              title="Force regenerate hints from latest signals"
            >
              {refreshing ? "Refreshing…" : "↻ Refresh"}
            </button>
          </div>
        </div>
        <p className="meta mt-2 italic">
          {data.target.name} does not see this tab. Hints regenerate automatically when new
          intake / quiz / review / coaching note / 1:1 prep lands.
        </p>
      </div>

      {!haveHints ? (
        <div className="card p-8 text-center text-sm text-ink-muted">
          Hints not yet generated. Click ↻ Refresh to create them.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {HINT_KEYS.map((key) => {
            const list = (data.hints as any)?.[key];
            if (!Array.isArray(list) || list.length === 0) return null;
            return (
              <section key={key} className="card p-5">
                <div className="flex items-center justify-between mb-3 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{FIELD_ICONS[key]}</span>
                    <div className="font-display font-semibold">{FIELD_LABELS[key]}</div>
                  </div>
                  {aeProfileId && (
                    <button
                      type="button"
                      onClick={() => saveSection(key, FIELD_LABELS[key], list)}
                      disabled={savingKey === key}
                      className="text-xs text-ink-muted hover:text-brand-indigo"
                      title="Save these hints as a private coaching note"
                    >
                      {savingKey === key ? "…" : savedKey === key ? "✓ saved" : "📌 save"}
                    </button>
                  )}
                </div>
                <ul className="space-y-2 text-sm">
                  {list.map((h: string, i: number) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-brand-orange font-bold mt-0.5">→</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {data.reasoningSummary && (
        <section className="card p-5">
          <div className="eyebrow mb-2">How the AI thinks about {data.target.name.split(" ")[0]}</div>
          <Markdown source={data.reasoningSummary} />
        </section>
      )}
    </div>
  );
}
