"use client";
import { useState } from "react";

export type AeTab = "overview" | "performance" | "intake" | "coaching" | "chat" | "reasoning";
type CoachingSubTab = "prep" | "hints" | "plans";

/**
 * AE profile tabs.
 *
 * Coaching is a parent tab containing three sub-tabs (1:1 Prep, Hints, Plans).
 * Consolidating them prevents horizontal scrolling on smaller screens — the
 * sub-tabs only render once the parent Coaching tab is active.
 */
export function AeTabs({
  initial = "overview",
  overview,
  performance,
  intake,
  prep,
  chat,
  hints,
  reasoning,
  plans,
  unreadPlans = 0,
}: {
  initial?: AeTab;
  overview: React.ReactNode;
  performance: React.ReactNode;
  intake: React.ReactNode;
  prep: React.ReactNode;
  chat: React.ReactNode;
  hints?: React.ReactNode;
  reasoning?: React.ReactNode;
  plans?: React.ReactNode;
  unreadPlans?: number;
}) {
  const [tab, setTab] = useState<AeTab>(initial);
  const [coachingSub, setCoachingSub] = useState<CoachingSubTab>(
    plans && unreadPlans > 0 ? "plans" : "prep"  // open the unread plan first if there is one
  );

  const tabs: Array<[AeTab, string, boolean]> = [
    ["overview", "Overview", true],
    ["performance", "Performance", true],
    ["intake", "Intake & Quizzes", true],
    ["coaching", "Coaching", !!(prep || hints || plans)],
    ["chat", "Chat with Profile", true],
    ["reasoning", "Reasoning", !!reasoning],
  ];

  const subTabs: Array<[CoachingSubTab, string, boolean]> = [
    ["prep", "1:1 Prep", true],
    ["hints", "Coaching Hints", !!hints],
    ["plans", "Coaching Plans", !!plans],
  ];

  return (
    <div className="space-y-4">
      <nav className="flex gap-1 border-b border-ink-softLine overflow-x-auto -mx-2 px-2">
        {tabs.filter(([, , show]) => show).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors flex items-center gap-1.5 ${
              tab === key
                ? key === "reasoning"
                  ? "border-brand-amber text-ink"
                  : key === "coaching"
                    ? "border-brand-emerald text-ink"
                    : "border-brand-orange text-ink"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {key === "reasoning" && <span className="text-brand-amber">●</span>}
            {key === "coaching" && unreadPlans > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand-orange text-white text-[10px] font-bold leading-none animate-pulse">
                {unreadPlans > 9 ? "9+" : unreadPlans}
              </span>
            )}
            {label}
          </button>
        ))}
      </nav>

      <div className="pt-2">
        {tab === "overview" && overview}
        {tab === "performance" && performance}
        {tab === "intake" && intake}
        {tab === "chat" && chat}
        {tab === "reasoning" && reasoning}
        {tab === "coaching" && (
          <div className="space-y-4">
            {/* Sub-tab strip — only rendered when the parent Coaching tab is active. */}
            <div className="flex gap-1 border-b border-ink-softLine/60">
              {subTabs.filter(([, , show]) => show).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCoachingSub(key)}
                  className={`px-3 py-1.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors flex items-center gap-1.5 ${
                    coachingSub === key
                      ? "border-brand-indigo text-ink"
                      : "border-transparent text-ink-muted hover:text-ink"
                  }`}
                >
                  {key === "plans" && unreadPlans > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-brand-orange text-white text-[10px] font-bold leading-none">
                      {unreadPlans > 9 ? "9+" : unreadPlans}
                    </span>
                  )}
                  {label}
                </button>
              ))}
            </div>
            <div className="pt-1">
              {coachingSub === "prep" && prep}
              {coachingSub === "hints" && hints}
              {coachingSub === "plans" && plans}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
