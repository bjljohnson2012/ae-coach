/**
 * Cadence math + schedule helpers shared by API + cron runner.
 */

export type Cadence = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY";

export const CADENCE_DAYS: Record<Cadence, number> = {
  WEEKLY: 7,
  BIWEEKLY: 14,
  MONTHLY: 30,
  QUARTERLY: 90,
};

export const CADENCE_LABELS: Record<Cadence, string> = {
  WEEKLY: "Every week",
  BIWEEKLY: "Every 2 weeks",
  MONTHLY: "Every month",
  QUARTERLY: "Every quarter",
};

/**
 * Compute the next run timestamp from `from` + cadence. Adds a small randomized
 * morning hour (8–10am UTC) so quizzes don't all land at midnight.
 */
export function nextRunAfter(from: Date, cadence: Cadence): Date {
  const days = CADENCE_DAYS[cadence];
  const next = new Date(from.getTime() + days * 24 * 3600 * 1000);
  // Set to 9am of that day in UTC
  next.setUTCHours(9, 0, 0, 0);
  return next;
}

/** Format a "next send" date for display. */
export function formatNextRun(d: Date | null | undefined): string {
  if (!d) return "—";
  const days = Math.round((d.getTime() - Date.now()) / (24 * 3600 * 1000));
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days} days`;
  if (days < 30) return `in ${Math.round(days / 7)} weeks`;
  return d.toLocaleDateString();
}
