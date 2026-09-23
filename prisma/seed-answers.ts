/**
 * Generates plausible intake answer rows for demo personas.
 *
 * For each (persona, question) pair:
 *   - LIKERT  → 1–5 score based on tag alignment with persona's lean
 *   - SLIDER  → 0–100 score based on tag alignment
 *   - MC      → pick the option whose tags best match persona
 *   - LONG    → short templated response built from persona traits
 *
 * Designed to produce realistic-feeling data so reasoning drawers + skill
 * synthesis have actual receipts.
 */

interface PersonaContract {
  name: string;
  bioShort?: string;
  enneagramType: string;       // "8"
  discProfile: string;         // "D" or "DC"
  mbtiType: string;            // "ESTJ"
  // skill scores 0-100
  scores: Record<string, number>;
}

interface SeedAnswer {
  questionId: string;
  value: any;
}

interface MinimalQuestion {
  id: string;
  category: string;
  questionType: "LIKERT" | "MULTIPLE_CHOICE" | "LONG_FORM" | "SLIDER";
  text: string;
  optionsJson: any;
  tagsJson: any;
}

/**
 * Build a "lean" map: tag → strength of agreement (1-5 for LIKERT scale).
 * Tags the persona embodies → 5; the opposites → 1; partial matches → 3.
 */
function buildLean(persona: PersonaContract): Record<string, number> {
  const lean: Record<string, number> = {};

  // DISC: persona's letter(s) → 5; the others → 1
  const discLetters = persona.discProfile.split("");
  for (const letter of ["D", "I", "S", "C"]) {
    lean[`DISC:${letter}`] = discLetters.includes(letter) ? 5 : 2;
  }

  // MBTI: 4 dichotomies. The letter they have → 5; the opposite → 1
  if (persona.mbtiType.length === 4) {
    const pairs: Array<[string, string]> = [["E", "I"], ["S", "N"], ["T", "F"], ["J", "P"]];
    for (const [a, b] of pairs) {
      const has = persona.mbtiType.includes(a) ? a : b;
      const not = has === a ? b : a;
      lean[`MBTI:${has}`] = 5;
      lean[`MBTI:${not}`] = 1;
    }
  }

  // Enneagram: their type → 5, others → 2
  for (let i = 1; i <= 9; i++) {
    lean[`ENNEAGRAM:${i}`] = String(i) === persona.enneagramType ? 5 : 2;
  }

  // Skills: convert 0-100 score to 1-5 scale
  for (const [cat, score] of Object.entries(persona.scores)) {
    lean[cat] = Math.max(1, Math.min(5, Math.round(score / 20)));
  }

  return lean;
}

/**
 * Strip "+N" / "-N" suffix from a tag to get the base.
 *   "DISCOVERY:+10" → "DISCOVERY"
 *   "DISC:D" → "DISC:D"
 *   "MOTIVATION:money" → "MOTIVATION:money"
 */
function tagBase(tag: string): string {
  if (!tag.includes(":")) return tag.toUpperCase();
  const [head, rest] = tag.split(":", 2);
  const valuePart = rest.split(/[+\-]/)[0].trim();
  return `${head.toUpperCase()}:${valuePart}`;
}

/** Sign multiplier from "+10" / "-5" suffix. */
function tagSign(tag: string): number {
  if (tag.includes("+")) return 1;
  if (tag.match(/:[A-Za-z0-9_]+-/)) return -1;
  return 1;
}

function answerLikert(question: MinimalQuestion, lean: Record<string, number>): number {
  const tags = (question.tagsJson as string[]) ?? [];
  const values: number[] = [];
  for (const t of tags) {
    const base = tagBase(t);
    const sign = tagSign(t);
    const v = lean[base];
    if (v !== undefined) values.push(sign === 1 ? v : 6 - v);
    // Also try without the colon part (e.g., "DISC:D" → fall back to "DISC")
    if (!values.length && t.includes(":")) {
      const head = t.split(":")[0].toUpperCase();
      const headV = lean[head];
      if (headV !== undefined) values.push(headV);
    }
  }
  if (values.length === 0) {
    // Slight noise around neutral so synthesis isn't trivial
    return 3 + (Math.random() < 0.5 ? -1 : 1);
  }
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.max(1, Math.min(5, Math.round(avg)));
}

function answerSlider(question: MinimalQuestion, lean: Record<string, number>): number {
  // 0–100 from the LIKERT-like calculation
  return Math.round((answerLikert(question, lean) / 5) * 100);
}

function answerMC(question: MinimalQuestion, lean: Record<string, number>): { value: string } {
  const opts = (question.optionsJson as Array<{ value: string; label: string; tags: string[] }>) ?? [];
  if (opts.length === 0) return { value: "" };
  let best = opts[0];
  let bestScore = -Infinity;
  for (const o of opts) {
    let score = 0;
    const optTags = Array.isArray(o.tags) ? o.tags : [];
    for (const t of optTags) {
      const base = tagBase(t);
      const sign = tagSign(t);
      const v = lean[base];
      if (v !== undefined) score += sign * v;
    }
    if (score > bestScore) { bestScore = score; best = o; }
  }
  return { value: best.value };
}

function answerLongForm(question: MinimalQuestion, persona: PersonaContract): string {
  // Templated by category + persona traits — keeps it realistic and short
  const firstName = persona.name.split(" ")[0];
  const cat = question.category;
  const note = persona.bioShort ? ` ${persona.bioShort}` : "";

  const templates: Record<string, string[]> = {
    SALES_STYLE: [
      `My approach is shaped by my ${persona.discProfile} style — I tend to lean into action and adjust as I go.${note}`,
      `Last deal I closed came down to pressure-testing the customer's timeline and making the implications of waiting visible.`,
      `My best discovery question is some variant of "what does it cost you to NOT solve this?" — it usually unsticks the budget conversation.`,
    ],
    COMMUNICATION: [
      `I'd describe a tense conversation as one where I summarized what I heard, named the tension, and asked what would make it better. It worked because I didn't try to fix it on the spot.`,
      `When a customer raises their voice, I slow down and ask one open question. Heat usually drops once they feel heard.`,
    ],
    PERSONALITY: [
      `When someone challenges my idea publicly, my first reflex is to listen for the kernel of truth and then respond on substance. I don't take it personally most of the time.`,
    ],
    MOTIVATION: [
      `Three years out, I want to be running my own book confidently and helping newer reps get there too. Numbers matter, but the work has to mean something.`,
    ],
    RESILIENCE: [
      `Last deal I lost taught me that I needed earlier alignment with the economic buyer. I started doing exec-stake-mapping in week two of every deal after that.`,
      `My reset routine: 20 minutes outside, write down what I'd do differently, then back at it. I don't let losses bleed into the next call.`,
    ],
    LEADERSHIP: [
      `When a deal goes sideways, I focus first on what the rep saw and missed — not on the customer. The diagnostic is in the rep's read of the room.`,
      `My weekly forecast cadence: Monday upload, Tuesday 1:1s on commit deals, Friday tighten-up. Anything sliding two weeks gets reclassed.`,
    ],
    DIRECTOR_MONTHLY_REVIEW: [
      `One win: ${firstName.replace("I", "they")} closed a deal on the back of a tighter MEDDPICC. One stumble: a stalled deal they should have qualified out of two weeks earlier.`,
      `Coaching focus next month: getting them to ask better follow-up questions and not solving prematurely.`,
    ],
  };

  const pool = templates[cat] ?? [
    `Speaking from my own experience as a ${persona.discProfile}/${persona.enneagramType}, I'd say it depends on context but I tend toward action over analysis.`,
  ];
  // Deterministic-ish selection using question id hash
  const idx = Math.abs(hashString(question.id)) % pool.length;
  return pool[idx];
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

/**
 * Generate the answer set for a persona across all global questions.
 */
export function generateAnswersForPersona(
  persona: PersonaContract,
  questions: MinimalQuestion[],
): SeedAnswer[] {
  const lean = buildLean(persona);
  const answers: SeedAnswer[] = [];

  // Skip director-monthly-review (those are answered BY directors ABOUT AEs, not self-intake)
  const intakeCategories = new Set([
    "SALES_STYLE", "COMMUNICATION", "PERSONALITY",
    "ENNEAGRAM", "DISC", "MBTI",
    "MOTIVATION", "RESILIENCE",
  ]);

  for (const q of questions) {
    if (!intakeCategories.has(q.category)) continue;

    let value: any;
    switch (q.questionType) {
      case "LIKERT":
        value = answerLikert(q, lean);
        break;
      case "SLIDER":
        value = answerSlider(q, lean);
        break;
      case "MULTIPLE_CHOICE":
        value = answerMC(q, lean);
        break;
      case "LONG_FORM":
        value = answerLongForm(q, persona);
        break;
      default:
        continue;
    }
    answers.push({ questionId: q.id, value });
  }

  return answers;
}

/**
 * Same generator but for directors — includes LEADERSHIP category.
 */
export function generateDirectorAnswers(
  persona: PersonaContract,
  questions: MinimalQuestion[],
): SeedAnswer[] {
  const lean = buildLean(persona);
  const answers: SeedAnswer[] = [];

  const directorIntakeCategories = new Set([
    "PERSONALITY", "ENNEAGRAM", "DISC", "MBTI",
    "MOTIVATION", "RESILIENCE", "LEADERSHIP", "COMMUNICATION",
  ]);

  for (const q of questions) {
    if (!directorIntakeCategories.has(q.category)) continue;

    let value: any;
    switch (q.questionType) {
      case "LIKERT":   value = answerLikert(q, lean); break;
      case "SLIDER":   value = answerSlider(q, lean); break;
      case "MULTIPLE_CHOICE": value = answerMC(q, lean); break;
      case "LONG_FORM":       value = answerLongForm(q, persona); break;
      default: continue;
    }
    answers.push({ questionId: q.id, value });
  }

  return answers;
}

export type { PersonaContract, MinimalQuestion, SeedAnswer };
