import type { SkillCategory } from "@prisma/client";

export function scoreToLevel(score: number): number {
  if (score < 20) return 1;
  if (score < 40) return 2;
  if (score < 60) return 3;
  if (score < 80) return 4;
  return 5;
}

export const SKILL_CATEGORY_LABELS: Record<SkillCategory, { label: string; emoji: string }> = {
  DISCOVERY: { label: "Discovery", emoji: "🔍" },
  OBJECTION_HANDLING: { label: "Objection Handling", emoji: "🛡" },
  CLOSING: { label: "Closing", emoji: "🎯" },
  COMMUNICATION: { label: "Communication", emoji: "💬" },
  RESILIENCE: { label: "Resilience", emoji: "⚡" },
  PRODUCT_MASTERY: { label: "Product Mastery", emoji: "🧠" },
  LEADERSHIP: { label: "Leadership", emoji: "🧭" },
  FORECASTING: { label: "Forecasting", emoji: "📊" },
};

// Categories displayed on the AE skill card.
// Director-only categories (LEADERSHIP, FORECASTING) live on DirectorProfile.
export const ALL_SKILL_CATEGORIES: SkillCategory[] = [
  "DISCOVERY",
  "OBJECTION_HANDLING",
  "CLOSING",
  "COMMUNICATION",
  "RESILIENCE",
  "PRODUCT_MASTERY",
];

export const DIRECTOR_SKILL_CATEGORIES: SkillCategory[] = [
  "LEADERSHIP",
  "FORECASTING",
  "COMMUNICATION",
  "RESILIENCE",
];
