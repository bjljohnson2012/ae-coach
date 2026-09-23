/**
 * Intake saturation engine.
 *
 * The full bank has 240+ questions. We cap initial intake at 100 questions
 * AND let the user stop early once we have enough signal across each
 * personality + skill dimension.
 *
 * "Enough signal" is determined by tag coverage thresholds — once each
 * dimension has its threshold of answers, that dimension is "saturated"
 * and the user gets a "finish early" button.
 *
 * No AI calls during intake. Pure tag-counting heuristic. Fast and free.
 *
 * If we ever want smart-skip (remove questions in saturated dimensions
 * from the upcoming order), the saturation map is the input that drives it.
 */

export const MAX_INTAKE_QUESTIONS = 100;
export const MIN_BEFORE_FINISH = 25;        // user can't stop before answering at least this many

/**
 * Per-dimension saturation thresholds. These are the numbers of answers needed
 * to confidently estimate that dimension. Tuned for the bulk question bank.
 */
const SATURATION_THRESHOLDS: Record<string, number> = {
  // Personality dimensions
  DISC:               8,
  ENNEAGRAM:         12,
  MBTI:               8,
  PERSONALITY:        6,
  MOTIVATION:         4,
  // Skill dimensions (categories)
  SALES_STYLE:        6,
  COMMUNICATION:      5,
  RESILIENCE:         5,
  PRODUCT_KNOWLEDGE:  4,
  // Skill tags (these can show up in any category's tagsJson)
  DISCOVERY:          5,
  OBJECTION_HANDLING: 5,
  CLOSING:            5,
  PRODUCT_MASTERY:    4,
  LEADERSHIP:         5,
  FORECASTING:        4,
};

interface MinimalQuestion {
  id: string;
  category: string;
  tagsJson?: any; // array of tags like "DISC:D", "DISCOVERY:+10", etc.
}

interface MinimalAnswer {
  questionId: string;
}

export interface SaturationStatus {
  // Counts of answers per dimension (category or top-level skill tag)
  counts: Record<string, number>;
  // Saturated dimensions (count >= threshold)
  saturated: string[];
  // Coverage 0-1: weighted fraction of dimensions that are saturated
  coverage: number;
  // mayFinish = enough dimensions saturated AND past minimum answers
  mayFinish: boolean;
  // How many answers given total
  answeredCount: number;
  // Time-remaining estimate in minutes (low/high range)
  estMinutesLow: number;
  estMinutesHigh: number;
  // Cap-aware total target the user can plan against
  targetTotal: number;
}

/**
 * Extract the dimensions touched by a single question. Each dimension is a
 * top-level key in SATURATION_THRESHOLDS — derived from the category and
 * from any tag whose prefix matches a known dimension.
 */
function dimensionsForQuestion(q: MinimalQuestion): string[] {
  const dims = new Set<string>();
  // Category is itself a dimension if we track it
  if (SATURATION_THRESHOLDS[q.category] !== undefined) dims.add(q.category);
  // Tags can be like "DISC:D" or "DISCOVERY:+10" — strip the suffix
  const tags = Array.isArray(q.tagsJson) ? q.tagsJson : [];
  for (const t of tags) {
    if (typeof t !== "string") continue;
    const head = t.split(":")[0];
    if (SATURATION_THRESHOLDS[head] !== undefined) dims.add(head);
  }
  return Array.from(dims);
}

/**
 * Compute saturation given the questions and the user's answers so far.
 */
export function computeSaturation(
  questions: MinimalQuestion[],
  answers: MinimalAnswer[],
): SaturationStatus {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const answeredCount = answers.length;

  // Tally answer counts per dimension
  const counts: Record<string, number> = {};
  for (const a of answers) {
    const q = byId.get(a.questionId);
    if (!q) continue;
    for (const d of dimensionsForQuestion(q)) {
      counts[d] = (counts[d] || 0) + 1;
    }
  }

  // Which dimensions are saturated?
  const saturated: string[] = [];
  let satWeight = 0;
  let totalWeight = 0;
  for (const [dim, threshold] of Object.entries(SATURATION_THRESHOLDS)) {
    totalWeight += 1;
    const c = counts[dim] || 0;
    if (c >= threshold) {
      saturated.push(dim);
      satWeight += 1;
    }
  }
  const coverage = totalWeight > 0 ? satWeight / totalWeight : 0;

  // mayFinish: at least 70% of dimensions saturated AND past the minimum.
  // The 70% rule lets us short-circuit a long tail of edge dimensions
  // (e.g., FORECASTING which only matters for directors) once we have
  // confident signal on the core five.
  const mayFinish = answeredCount >= MIN_BEFORE_FINISH && coverage >= 0.7;

  // Time estimate. Average ~10 seconds per question (mix of likert/MC/short prose).
  // Long-form takes longer; we average 12s as a fudge.
  const remaining = Math.max(0, Math.min(MAX_INTAKE_QUESTIONS, questions.length) - answeredCount);
  const estSecondsLow = remaining * 8;
  const estSecondsHigh = remaining * 14;

  return {
    counts,
    saturated,
    coverage,
    mayFinish,
    answeredCount,
    estMinutesLow: Math.max(1, Math.round(estSecondsLow / 60)),
    estMinutesHigh: Math.max(1, Math.round(estSecondsHigh / 60)),
    targetTotal: Math.min(MAX_INTAKE_QUESTIONS, questions.length),
  };
}
