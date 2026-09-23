"use client";
import { useEffect, useState } from "react";

/**
 * Green count badge for the Tasks nav button. Shows the number of OPEN tasks
 * assigned to the current user. Polls every 60 seconds — light load, fresh
 * enough for the workflow.
 *
 * Renders nothing when count is 0 so the nav stays clean.
 */
export function TasksNavBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/me/task-count");
        if (!res.ok) return;
        const j = await res.json();
        if (!cancelled) setCount(typeof j.count === "number" ? j.count : 0);
      } catch {
        /* ignore */
      }
    }
    void load();
    const interval = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (!count || count === 0) return null;

  return (
    <span
      className="ml-1.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-brand-emerald text-white text-[10px] font-bold leading-none"
      aria-label={`${count} open ${count === 1 ? "task" : "tasks"}`}
      title={`${count} open ${count === 1 ? "task" : "tasks"} assigned to you`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
