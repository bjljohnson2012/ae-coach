"use client";
import { useState } from "react";

export type DirTab = "overview" | "team" | "coaching" | "chat" | "reasoning";
type CoachingSubTab = "prep" | "hints" | "plans";

export function DirectorTabs({
  initial = "overview",
  overview,
  team,
  prep,
  chat,
  hints,
  reasoning,
  plans,
  unreadPlans = 0,
}: {
  initial?: DirTab;
  overview: React.ReactNode;
  team: React.ReactNode;
  prep: React.ReactNode;
  chat: React.ReactNode;
  hints?: React.ReactNode;
  reasoning?: React.ReactNode;
  plans?: React.ReactNode;
  unreadPlans?: number;
}) {
  const [tab, setTab] = useState<DirTab>(initial);
  const [coachingSub, setCoachingSub] = useState<CoachingSubTab>(
    plans && unreadPlans > 0 ? "plans" : "prep"
  );

  const tabs: Array<[DirTab, string, boolean]> = [
    ["overview", "Overview", true],
    ["team", "Team Performance", true],
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
        {tab === "team" && team}
        {tab === "chat" && chat}
        {tab === "reasoning" && reasoning}
        {tab === "coaching" && (
          <div className="space-y-4">
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
