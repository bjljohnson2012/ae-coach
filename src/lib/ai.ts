/**
 * Grok (xAI) client. Single source of all AI calls in the app.
 * Swap providers? Only this file changes.
 */
import OpenAI from "openai";

/**
 * Exported so other modules (recalibrate, gamification grading, etc.) can
 * reuse the same client without instantiating a second one.
 */
export const grok = new OpenAI({
  apiKey: process.env.GROK_API_KEY,
  baseURL: process.env.GROK_BASE_URL ?? "https://api.x.ai/v1",
});

// Two-tier model strategy.
//
//  MODEL_FAST  — used for routine cleanup ops (classify, enhance MC option,
//                cleanup article, extract metadata, generate task description,
//                drill scenario gen + grading). Defaults to the cheap tier
//                regardless of per-org override.
//
//  MODEL_SYNTH — used for synthesis ops (intake → profile, monthly review,
//                cross-ref, recommendations, brand suggest, website analyze,
//                article-from-url, generate questions, product brief).
//                Resolves in this order:
//                  per-org override (Org.aiModel)
//                  -> GROK_MODEL env var
//                  -> grok-4.3 (default)
//
// Override with env vars:
//   GROK_MODEL_FAST  — fast tier default
//   GROK_MODEL       — synth tier default (per-org can override)
//
// Migration notes (May 15, 2026 deprecation):
//   grok-4-fast-reasoning → grok-4.3
//   grok-3                → grok-4.3
//   grok-code-fast-1      → grok-4.3
//   grok-3-mini           — NOT in deprecation list, still works
//   grok-4-fast-non-reasoning → grok-4.20-non-reasoning
//   See: https://docs.x.ai/developers/migration/may-15-deprecation
//
// v3.37.9 — defaults flipped back to the post-May-15 replacements. The
// previously-observed empty payloads were caused by the Director synth
// system prompt missing its JSON schema, NOT by the model being unavailable.
// See SYNTHESIS_SYSTEM_PROMPT and DIRECTOR_SYSTEM_PROMPT below for the fix.
export const MODEL_FAST = process.env.GROK_MODEL_FAST ?? "grok-4.20-non-reasoning";
export const MODEL_DEFAULT = process.env.GROK_MODEL ?? "grok-4.3";

/** Resolve which synth model to use given an optional per-org override. */
export function resolveSynthModel(orgModel?: string | null): string {
  if (orgModel && orgModel.trim()) return orgModel.trim();
  return MODEL_DEFAULT;
}

// Backwards-compat alias for legacy call sites that haven't been threaded yet.
const MODEL = MODEL_DEFAULT;

// ============================================================
// 1. PROFILE SYNTHESIS (AE) — wizard answers → profile + scores
// ============================================================

export interface SynthesizeInput {
  aeName: string;
  companyContext: {
    name: string;
    requiredSkills: Array<{ category: string; weight: number }>;
    products: Array<{ name: string; summary?: string }>;
    values: string[];
    salesMethodology?: string;
  };
  answers: Array<{
    category: string;
    tags: string[];
    questionText: string;
    questionType: string;
    value: unknown;
  }>;
}

export interface SynthesizedProfile {
  personalitySummary: string;
  salesStyleSummary: string;
  communicationSummary: string;
  motivations: string[];
  strengths: string[];
  weaknesses: string[];
  enneagramType?: string;
  discProfile?: string;
  mbtiType?: string;
  skillScores: Array<{
    category:
      | "DISCOVERY"
      | "OBJECTION_HANDLING"
      | "CLOSING"
      | "COMMUNICATION"
      | "RESILIENCE"
      | "PRODUCT_MASTERY";
    score: number;
    notes: string;
  }>;
}

// v3.37.9 — replaced TypeScript-style schema with a concrete JSON example.
// The previous "string" / "string[]" placeholders confused the model in
// json_object mode, sometimes producing near-empty objects.
const SYNTHESIS_SYSTEM_PROMPT = `You are an expert sales coach analyzing an Account Executive's intake.

Output VALID JSON matching exactly this shape (use real content for every field, NOT placeholders):

{
  "personalitySummary": "2-4 sentence narrative of how they think, decide, connect.",
  "salesStyleSummary": "2-4 sentence narrative of how they sell — relationship, technical, consultative, etc.",
  "communicationSummary": "2-4 sentence narrative of communication preferences + style.",
  "motivations": ["3-5 short phrases naming what drives them"],
  "strengths": ["3-5 short phrases — observable strengths"],
  "weaknesses": ["3-5 short phrases — growth areas, honest"],
  "enneagramType": "1-9 (or 1w2 / 7w8 etc. with wing)",
  "discProfile": "D, I, S, C, or combo like DC",
  "mbtiType": "ENTJ, INFP, etc.",
  "skillScores": [
    {"category": "DISCOVERY", "score": 55, "notes": "1 sentence on where they are."},
    {"category": "OBJECTION_HANDLING", "score": 60, "notes": "..."},
    {"category": "CLOSING", "score": 50, "notes": "..."},
    {"category": "COMMUNICATION", "score": 65, "notes": "..."},
    {"category": "RESILIENCE", "score": 55, "notes": "..."},
    {"category": "PRODUCT_MASTERY", "score": 45, "notes": "..."}
  ]
}

Hard rules:
- EVERY field must be filled — no nulls, no empty strings, no empty arrays.
- All six skillScores entries are required.
- Score conservatively for new AEs; most should land 40–65.
- If skillRubrics is present in the user payload, USE EACH RUBRIC as the 100-level benchmark for that skill. The whatGoodLooksLike string defines what a 90+ AE looks like for THIS org — score relative to that bar, not against a generic industry default.`;

/**
 * v3.37 — accept per-skill rubric overrides ("what good looks like") so the
 * scorer judges relative to the org's bar, not the platform default.
 */
export async function synthesizeProfile(
  input: SynthesizeInput,
  opts: { skillRubrics?: Record<string, string> } = {},
): Promise<SynthesizedProfile> {
  const userPayload = opts.skillRubrics && Object.keys(opts.skillRubrics).length > 0
    ? { ...input, skillRubrics: opts.skillRubrics }
    : input;
  const completion = await grok.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYNTHESIS_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(userPayload, null, 2) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Grok returned empty response");
  return JSON.parse(raw) as SynthesizedProfile;
}

// ============================================================
// 2. DIRECTOR LEADERSHIP SYNTHESIS
// ============================================================

export interface DirectorSynthesizeInput {
  directorName: string;
  companyContext: { name: string; salesMethodology?: string };
  answers: SynthesizeInput["answers"];
}

export interface DirectorSynthesizedProfile {
  personalitySummary: string;
  leadershipSummary: string;
  forecastingSummary: string;
  motivations: string[];
  strengths: string[];
  weaknesses: string[];
  enneagramType?: string;
  discProfile?: string;
  mbtiType?: string;
  skillScores: Array<{
    category: "LEADERSHIP" | "FORECASTING" | "COMMUNICATION" | "RESILIENCE";
    score: number;
    notes: string;
  }>;
}

// v3.37.9 — added explicit JSON shape. Previous prompt said "matching the
// schema" without giving one, which caused Grok to return near-empty JSON
// — the root cause of the "AI returned an empty payload" error users hit.
const DIRECTOR_SYSTEM_PROMPT = `You are an executive coach analyzing a Sales Director's intake.

Output VALID JSON matching exactly this shape (use real content for every field, NOT placeholders):

{
  "personalitySummary": "2-4 sentence narrative of how they think, decide, connect.",
  "leadershipSummary": "2-4 sentence narrative of their leadership style — how they coach, hold accountability, build team rituals.",
  "forecastingSummary": "2-4 sentence narrative of how they call deals, run forecast meetings, manage uncertainty.",
  "motivations": ["3-5 short phrases naming what drives them as a leader"],
  "strengths": ["3-5 short phrases — observable leadership strengths"],
  "weaknesses": ["3-5 short phrases — leadership growth areas, honest"],
  "enneagramType": "1-9 (or 1w2 / 7w8 etc. with wing)",
  "discProfile": "D, I, S, C, or combo like DC",
  "mbtiType": "ENTJ, INFP, etc.",
  "skillScores": [
    {"category": "LEADERSHIP", "score": 60, "notes": "1 sentence on where they are as a coach + accountability holder."},
    {"category": "FORECASTING", "score": 55, "notes": "1 sentence on forecast accuracy + discipline."},
    {"category": "COMMUNICATION", "score": 65, "notes": "1 sentence on clarity + presence."},
    {"category": "RESILIENCE", "score": 55, "notes": "1 sentence on grit + composure under pressure."}
  ]
}

Hard rules:
- EVERY field must be filled — no nulls, no empty strings, no empty arrays.
- All four skillScores entries are required.
- Score conservatively. Most directors should land 50–70 — leadership skills are hard.
- Be honest about growth areas — directors get coached too.
- If skillRubrics is present in the user payload, USE EACH RUBRIC as the 100-level benchmark for that leadership skill. The whatGoodLooksLike string defines what a 90+ leader looks like for THIS org — score relative to that bar.`;

/**
 * v3.37 — accept per-skill rubric overrides for org-aware leadership scoring.
 */
export async function synthesizeDirectorProfile(
  input: DirectorSynthesizeInput,
  opts: { skillRubrics?: Record<string, string> } = {},
): Promise<DirectorSynthesizedProfile> {
  const userPayload = opts.skillRubrics && Object.keys(opts.skillRubrics).length > 0
    ? { ...input, skillRubrics: opts.skillRubrics }
    : input;
  const completion = await grok.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: DIRECTOR_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(userPayload, null, 2) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Grok returned empty response");
  return JSON.parse(raw) as DirectorSynthesizedProfile;
}

// ============================================================
// 3. CROSS-REFERENCE PREP DOC (existing)
// ============================================================

export interface CrossRefInput {
  aeProfile: {
    name: string;
    personalitySummary?: string | null;
    salesStyleSummary?: string | null;
    communicationSummary?: string | null;
    strengths: string[];
    weaknesses: string[];
    skillScores: Array<{ category: string; score: number }>;
  };
  prepDoc: { weekOf: string; title?: string | null; content: string };
  companyContext: { name: string; salesMethodology?: string | null };
}

export interface CrossRefOutput {
  talkingPoints: Array<{ point: string; rationale: string; tieToWeakness?: string }>;
  recommendations: Array<{ title: string; description: string; category?: string; routeTo?: "AE" | "DIRECTOR_ONLY" }>;
}

const CROSS_REF_SYSTEM_PROMPT = `You are a sales coach preparing a director for a 1:1.
Given the AE's profile and weekly prep doc, generate 3-5 specific coaching talking points and 1-3 recommendations.
Tag each recommendation with category (SALES_SKILL | PRODUCT_KNOWLEDGE | PERSONALITY | GENERAL) and routeTo (AE | DIRECTOR_ONLY).
PERSONALITY recommendations MUST always have routeTo = "DIRECTOR_ONLY".
Output JSON: {"talkingPoints": [...], "recommendations": [...]}`;

export async function crossReferencePrepDoc(input: CrossRefInput): Promise<CrossRefOutput> {
  const completion = await grok.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: CROSS_REF_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(input, null, 2) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.4,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Grok returned empty response");
  return JSON.parse(raw) as CrossRefOutput;
}

// ============================================================
// 4. AI-GENERATE INTAKE QUESTIONS
// ============================================================

export interface GenerateQuestionsInput {
  category: string; // QuestionCategory
  count: number;
  context?: {
    productName?: string;
    productSummary?: string;
    salesMethodology?: string;
    companyValues?: string[];
  };
  // Existing question texts to avoid duplication
  avoidTexts?: string[];
  // Restrict to these question types (else mix all)
  allowedTypes?: Array<"LONG_FORM" | "MULTIPLE_CHOICE" | "LIKERT" | "SLIDER">;
}

export interface GeneratedQuestion {
  text: string;
  questionType: "LONG_FORM" | "MULTIPLE_CHOICE" | "LIKERT" | "SLIDER";
  optionsJson?: Array<{ value: string; label: string; tags: string[] }>;
  tagsJson: string[]; // hidden mapping to skill categories like "DISCOVERY:+10"
  rationale: string;
}

const GENERATE_QUESTIONS_PROMPT = `You are a sales coaching content designer.
Generate intake quiz questions for a specific category.
If "allowedTypes" is provided, ONLY use those types. Otherwise mix LONG_FORM, MULTIPLE_CHOICE, LIKERT (skip SLIDER unless requested).
For MULTIPLE_CHOICE: provide 4 options each with a "tags" array like ["DISCOVERY:+10", "RESILIENCE:-5"] that maps the answer to skill score deltas.
For LIKERT/SLIDER: tagsJson on the question itself maps to skill categories.
Avoid duplicating any text in avoidTexts.
Output JSON: {"questions": [{"text": ..., "questionType": ..., "optionsJson": ..., "tagsJson": [...], "rationale": ...}]}`;

export async function generateQuestions(input: GenerateQuestionsInput): Promise<GeneratedQuestion[]> {
  const completion = await grok.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: GENERATE_QUESTIONS_PROMPT },
      { role: "user", content: JSON.stringify(input, null, 2) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Grok returned empty response");
  const parsed = JSON.parse(raw) as { questions: GeneratedQuestion[] };
  return parsed.questions ?? [];
}

// ============================================================
// 5. AI FILE CLASSIFIER
// ============================================================

export interface ClassifyFileInput {
  filename: string;
  mimeType: string;
  // Extracted plain-text preview (first ~3000 chars)
  textPreview: string;
  // Available AEs the director directs (id + name)
  candidateAes: Array<{ id: string; name: string }>;
}

export interface ClassifyFileOutput {
  kind:
    | "AE_PREP_DOC"
    | "COACHING_DOC"
    | "PROFILE_ASSET"
    | "PRODUCT_REFERENCE"
    | "PERSONALITY_NOTE"
    | "GENERAL"
    | "OTHER";
  aeProfileId?: string;
  updateIntent: "ADD_TO_COACHING_LOG" | "UPDATE_PROFILE" | "REFERENCE_ONLY";
  visibility: "AE_ONLY" | "DIRECTOR_ONLY" | "BOTH";
  confidence: number; // 0-1
  rationale: string;
}

const CLASSIFY_FILE_PROMPT = `You are a file router for a sales coaching platform.
Given a filename, mime type, and text preview, suggest:
- kind: best match from the enum
- aeProfileId: if the doc is clearly about a specific AE (use their id), else omit
- updateIntent: ADD_TO_COACHING_LOG | UPDATE_PROFILE | REFERENCE_ONLY
- visibility: AE_ONLY | DIRECTOR_ONLY | BOTH (default DIRECTOR_ONLY for coaching/personality content)
- confidence: 0-1
- rationale: 1 sentence

Personality notes default to DIRECTOR_ONLY visibility. Coaching docs about a specific AE → ADD_TO_COACHING_LOG. Prep docs → ADD_TO_COACHING_LOG with high confidence on aeProfileId.
Output JSON.`;

export async function classifyFile(input: ClassifyFileInput): Promise<ClassifyFileOutput> {
  const completion = await grok.chat.completions.create({
    model: MODEL_FAST,
    messages: [
      { role: "system", content: CLASSIFY_FILE_PROMPT },
      { role: "user", content: JSON.stringify(input, null, 2) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Grok returned empty response");
  return JSON.parse(raw) as ClassifyFileOutput;
}

// ============================================================
// 6. RECOMMENDATIONS FROM KNOWLEDGE LIBRARY
// ============================================================

export interface RecommendInput {
  aeProfile: {
    name: string;
    strengths: string[];
    weaknesses: string[];
    skillScores: Array<{ category: string; score: number }>;
  };
  // Top-k articles fetched by full-text search
  contextArticles: Array<{
    id: string;
    repositoryKind: "PRODUCT" | "SALES_SKILL" | "PERSONALITY" | "LEADERSHIP";
    title: string;
    body: string; // trimmed
    productName?: string;
    skillCategory?: string;
  }>;
  focus?: "weakest_skill" | "specific_product" | "broad";
}

export interface AiRecommendation {
  title: string;
  description: string;
  category: "SALES_SKILL" | "PRODUCT_KNOWLEDGE" | "PERSONALITY" | "LEADERSHIP" | "HEALTH" | "GENERAL";
  routeTo: "AE" | "DIRECTOR_ONLY";
  channel: "TASK" | "EMAIL" | "NOTE";
  sourceArticleIds: string[];
}

const RECOMMEND_SYSTEM_PROMPT = `You generate actionable recommendations for sales coaches and AEs.
Given the AE profile and a set of relevant knowledge articles, output 2-5 recommendations.
Each one cites which sourceArticleIds informed it.

ROUTING RULES (server enforces, but follow them too):
- PERSONALITY → routeTo "DIRECTOR_ONLY", channel "NOTE"
- LEADERSHIP → routeTo "DIRECTOR_ONLY", channel "NOTE"
- SALES_SKILL → routeTo "AE", channel "TASK" or "EMAIL"
- PRODUCT_KNOWLEDGE → routeTo "AE", channel "TASK"
- HEALTH/wellbeing → routeTo "AE", channel "EMAIL" with a soft tone

Output JSON: {"recommendations": [...]}`;

export async function generateRecommendations(input: RecommendInput): Promise<AiRecommendation[]> {
  const completion = await grok.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: RECOMMEND_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(input, null, 2) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.5,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Grok returned empty response");
  const parsed = JSON.parse(raw) as { recommendations: AiRecommendation[] };
  return parsed.recommendations ?? [];
}

// ============================================================
// 7. MONTHLY DIRECTOR REVIEW SUMMARY (compresses director's monthly answers)
// ============================================================

export interface MonthlyReviewInput {
  aeName: string;
  monthOf: string;
  director: { name: string };
  answers: Array<{
    questionText: string;
    questionType: string;
    value: unknown;
    skillCategory?: string;
  }>;
  priorScores: Array<{ category: string; score: number }>;
}

export interface MonthlyReviewOutput {
  summary: string; // 2-3 sentence narrative
  scoreDeltas: Array<{ category: string; delta: number; rationale: string }>;
  followUpRecommendations: Array<{ title: string; description: string; category: string; routeTo: "AE" | "DIRECTOR_ONLY" }>;
}

const MONTHLY_REVIEW_PROMPT = `You analyze a director's monthly review of an AE.
Given prior scores and the director's structured answers, output:
- summary: 2-3 sentence narrative
- scoreDeltas: how to adjust each skill score (-15 to +15 typically; reserve larger for clear evidence)
- followUpRecommendations: 1-3 next-step recs, with category and routeTo (PERSONALITY → DIRECTOR_ONLY)
Output JSON.`;

export async function summarizeMonthlyReview(input: MonthlyReviewInput): Promise<MonthlyReviewOutput> {
  const completion = await grok.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: MONTHLY_REVIEW_PROMPT },
      { role: "user", content: JSON.stringify(input, null, 2) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Grok returned empty response");
  return JSON.parse(raw) as MonthlyReviewOutput;
}

// ============================================================
// 8a. GENERATE TASKS for an AE based on profile + skill gaps
// ============================================================

export interface GenerateTasksInput {
  aeName: string;
  strengths: string[];
  weaknesses: string[];
  skillScores: Array<{ category: string; score: number }>;
  existingOpenTasks: Array<{ title: string }>;
  count?: number;
  /**
   * v3.36 — role-aware generation. When the target is a leader (Director,
   * VP, CompanyAdmin, OrgAdmin) the AI generates coaching / enablement
   * actions, NOT individual contributor tasks like "build top of funnel."
   * Default behavior treats unknown roles as AE.
   */
  role?: "AE" | "DIRECTOR" | "VP_SALES" | "COMPANY_ADMIN" | "ORG_ADMIN";
}

export interface GeneratedTask {
  title: string;
  description: string;
  urgency: "URGENT" | "HIGH" | "MEDIUM" | "LOW";
  category: "SALES_SKILL" | "PRODUCT_KNOWLEDGE" | "PERSONALITY" | "GENERAL";
  dueInDays: number; // 0-90
  rationale: string;
}

const GENERATE_TASKS_PROMPT_AE = `You are a sales coach generating an AE's next-best-action task list.
Avoid duplicating any task in existingOpenTasks.
Rank by urgency: URGENT (this week), HIGH (this 2 weeks), MEDIUM (this month), LOW (next quarter).
Focus on the AE's lowest skill scores. Make tasks specific, actionable, and measurable — NOT "improve discovery" but "Run two discovery calls this week and capture MEDDPICC notes for each."

Routing rule: PERSONALITY tasks default urgency to LOW because personality is for director coaching, not AE self-action.

Output JSON: {"tasks": [{title, description, urgency, category, dueInDays, rationale}]}`;

const GENERATE_TASKS_PROMPT_LEADER = `You are an executive sales coach generating a SALES LEADER's next-best-action task list.
The target is a Director / VP / Sales Leader — NOT an individual contributor.

CRITICAL ROLE BOUNDARIES — never violate these:
- Do NOT assign individual-contributor tasks: prospecting, building top of funnel, running discovery calls, sending outbound emails, booking demos, cold-calling, working specific deals.
- DO assign leadership and enablement tasks: coaching their AEs, running deal reviews, observing calls, providing feedback, building team rituals, hiring, performance management, forecast accuracy, pipeline coverage rituals, team training.
- Reframe IC weaknesses as coaching opportunities: instead of "build top of funnel," generate "coach AE on building top of funnel" or "review prospecting metrics with each rep."

The skillScores you see ARE the leader's leadership skill scores (DIRECTOR_COACHING, FORECASTING, LEADERSHIP, etc.) — focus tasks on growing their leadership behaviors and improving the team they coach.

Avoid duplicating any task in existingOpenTasks.
Rank by urgency: URGENT (this week), HIGH (this 2 weeks), MEDIUM (this month), LOW (next quarter).
Make tasks specific, actionable, and measurable — NOT "coach the team" but "Run a 30-minute call review with each direct report this week using the MEDDPICC scorecard."

Output JSON: {"tasks": [{title, description, urgency, category, dueInDays, rationale}]}`;

export async function generateTasksForAe(input: GenerateTasksInput): Promise<GeneratedTask[]> {
  const isLeader = input.role && input.role !== "AE";
  const systemPrompt = isLeader ? GENERATE_TASKS_PROMPT_LEADER : GENERATE_TASKS_PROMPT_AE;

  // Re-label inputs for the leader prompt so the model sees them as
  // leadership context, not IC context.
  const userPayload = isLeader
    ? {
        leaderName: input.aeName,
        leaderRole: input.role,
        leaderStrengths: input.strengths,
        leaderWeaknesses: input.weaknesses,
        leadershipSkillScores: input.skillScores,
        existingOpenTasks: input.existingOpenTasks,
        count: input.count ?? 5,
      }
    : { ...input, count: input.count ?? 5 };

  const completion = await grok.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(userPayload, null, 2) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.5,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Grok returned empty response");
  const parsed = JSON.parse(raw) as { tasks: GeneratedTask[] };
  return parsed.tasks ?? [];
}

// ============================================================
// 8b. SYNTHESIZE PRODUCT BRIEF from multiple uploaded files
// ============================================================

export interface SynthesizeProductInput {
  productName: string;
  audience?: string;
  sourceTexts: Array<{ filename: string; text: string }>;
}

export interface SynthesizedProduct {
  summary: string;          // 3-5 sentences
  keyValueProps: string[];  // 3-7
  audienceFit: string[];    // 2-5 personas
  commonObjections: string[]; // 3-5 likely
  competitiveDifferentiators: string[]; // 2-4
  demoFlow: string[];       // 4-8 steps
}

const SYNTHESIZE_PRODUCT_PROMPT = `You analyze multiple source files about a single product and synthesize a clean product brief.
Be specific. Cite from the source text where possible (don't invent).
Output strict JSON:
{
  "summary": "3-5 sentences",
  "keyValueProps": ["...", "..."],
  "audienceFit": ["..."],
  "commonObjections": ["..."],
  "competitiveDifferentiators": ["..."],
  "demoFlow": ["step 1", "step 2", ...]
}`;

export async function synthesizeProductBrief(input: SynthesizeProductInput): Promise<SynthesizedProduct> {
  // Trim each source to keep the call reasonable
  const trimmed = input.sourceTexts.map((s) => ({
    filename: s.filename,
    text: s.text.slice(0, 8000),
  }));
  const completion = await grok.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYNTHESIZE_PRODUCT_PROMPT },
      { role: "user", content: JSON.stringify({ ...input, sourceTexts: trimmed }, null, 2) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Grok returned empty response");
  return JSON.parse(raw) as SynthesizedProduct;
}

// ============================================================
// 8c. GENERATE BRAND COLOR PALETTES (3 options)
// ============================================================

export interface BrandSuggestInput {
  brandName: string;
  description?: string;
  websiteUrl?: string;
  preferredVibe?: "professional" | "energetic" | "minimal" | "bold" | "warm";
}

export interface BrandPalette {
  name: string;        // e.g. "Executive Navy"
  primary: string;     // hex
  secondary: string;
  accent: string;
  neutral: string;
  rationale: string;   // 1 sentence
}

const BRAND_SUGGEST_PROMPT = `You are a brand designer.
Given a brand name + description, propose THREE distinct palette options.
Each palette: primary (deep anchor color), secondary (supporting structure color), accent (single CTA color), neutral (text/background-friendly grey).
Output JSON: {"palettes": [{name, primary, secondary, accent, neutral, rationale}]}
Use real hex codes. No pastels for primary. No neon for serious brands. One CTA accent only.`;

export async function suggestBrandPalettes(input: BrandSuggestInput): Promise<BrandPalette[]> {
  const completion = await grok.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: BRAND_SUGGEST_PROMPT },
      { role: "user", content: JSON.stringify(input, null, 2) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.6,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Grok returned empty response");
  const parsed = JSON.parse(raw) as { palettes: BrandPalette[] };
  return parsed.palettes ?? [];
}

// ============================================================
// 8d. GENERATE TASK DESCRIPTION from title + AE context
// ============================================================

export interface TaskDescribeInput {
  title: string;
  aeName: string;
  weaknesses: string[];
  strengths: string[];
  skillScores: Array<{ category: string; score: number }>;
}

export async function generateTaskDescription(input: TaskDescribeInput): Promise<string> {
  const prompt = `You are a sales coach turning a task title into a 2-4 sentence actionable description.
Given the AE's profile, write what they should DO, by WHEN, and HOW success is measured.
Tie to their lowest skill scores when relevant. Concrete, not generic.
Output plain text — no markdown headings.`;
  const completion = await grok.chat.completions.create({
    model: MODEL_FAST,
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: JSON.stringify(input, null, 2) },
    ],
    temperature: 0.5,
  });
  return completion.choices[0]?.message?.content?.trim() ?? "";
}

// ============================================================
// 8e. ANALYZE A COMPANY WEBSITE — products + knowledge starters
// ============================================================

export interface AnalyzeWebsiteInput {
  orgName: string;
  websiteUrl: string;
  websiteText?: string;       // pre-fetched HTML-stripped text
  existingProductSlugs?: string[];
}

export interface AnalyzedProduct {
  name: string;
  slug: string;             // lowercase-dashed
  summary: string;
  audience?: string;
}

export interface AnalyzedArticle {
  title: string;
  body: string;             // markdown ~200-500 words
  tags: string[];
  repositoryKind: "PRODUCT" | "SALES_SKILL" | "PERSONALITY" | "LEADERSHIP" | "CUSTOM";
}

export interface AnalyzeWebsiteOutput {
  about: string;            // 2-3 sentence org description
  products: AnalyzedProduct[];
  articles: AnalyzedArticle[];
  audience: string[];        // who they sell to
  tone: string;              // brand voice in 1 line
}

const ANALYZE_WEBSITE_PROMPT = `You are onboarding a company into a sales coaching platform.
Given the org name + website text, produce:
- about: 2-3 sentence org description
- products: every distinct product/service line you can identify with a slug, summary (1-2 sentences), and primary audience
- articles: 3-6 starter knowledge entries (sales talking points, pain-points-they-solve, customer types, competitive context). Mark repositoryKind appropriately.
- audience: who they sell to (1-3 short personas)
- tone: brand voice in 1 sentence

Skip products in existingProductSlugs (they're already created). Be concrete. Pull real names from the source text — don't invent products. If unsure, say "Generic SaaS" or note uncertainty.

Output strict JSON.`;

export async function analyzeWebsite(input: AnalyzeWebsiteInput): Promise<AnalyzeWebsiteOutput> {
  const completion = await grok.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: ANALYZE_WEBSITE_PROMPT },
      { role: "user", content: JSON.stringify({
        ...input,
        websiteText: input.websiteText?.slice(0, 14000),
      }, null, 2) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Grok returned empty response");
  return JSON.parse(raw) as AnalyzeWebsiteOutput;
}

// ============================================================
// 8h. AI ENHANCE A SINGLE MULTIPLE-CHOICE OPTION
// ============================================================

export interface EnhanceOptionInput {
  questionText: string;
  questionCategory: string;
  current: { value: string; label: string; tags: string[] };
  goal?: "clearer" | "shorter" | "more diagnostic" | "score-tag review";
}

export interface EnhanceOptionOutput {
  label: string;          // refined label
  tags: string[];         // refined score tags ("DISCOVERY:+10")
  rationale: string;
}

const ENHANCE_OPTION_PROMPT = `You are a sales-quiz authoring assistant.
Given a question + one of its multiple-choice options, propose a refined version of just that option.
Keep the option's intent. Tighten the label. Suggest score tags using the format SKILL:+N or SKILL:-N
(skills include DISCOVERY, OBJECTION_HANDLING, CLOSING, COMMUNICATION, RESILIENCE, PRODUCT_MASTERY,
LEADERSHIP, FORECASTING; personality tags include MBTI:E/I/N/T/F/J/P, DISC:D/I/S/C, ENNEAGRAM:1-9).
Output JSON: {"label", "tags", "rationale"}.`;

export async function enhanceMcOption(input: EnhanceOptionInput): Promise<EnhanceOptionOutput> {
  const completion = await grok.chat.completions.create({
    model: MODEL_FAST,
    messages: [
      { role: "system", content: ENHANCE_OPTION_PROMPT },
      { role: "user", content: JSON.stringify(input, null, 2) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.4,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Grok returned empty response");
  return JSON.parse(raw) as EnhanceOptionOutput;
}

// ============================================================
// 8f. ARTICLE FROM URL (no server fetch — Grok handles it)
// ============================================================

export interface ArticleFromUrlInput {
  url: string;
  repositoryKind: "PRODUCT" | "SALES_SKILL" | "PERSONALITY" | "LEADERSHIP" | "CUSTOM";
  repositoryName: string;
  intentNote?: string;
}

const ARTICLE_FROM_URL_PROMPT = `You are organizing a knowledge library.
Given a URL, write a clean knowledge article entry. Use what you already know about the URL or its likely contents based on the domain, path, and topic.
If the URL is obviously not informative (a homepage with no specifics, a paywalled site you can't reason about), say so honestly in the body — don't fabricate.

Output strict JSON:
{
  "title": "4-10 word specific title",
  "body": "clean markdown — 200-700 words ideally; preserve structure (## headings, bullets); end with a 'Source' line citing the URL",
  "tags": ["3-7 short keyword tags"],
  "summary": "one sentence describing what this teaches",
  "confidence": "high | medium | low — how confident you are about the page contents"
}`;

export interface ArticleFromUrlOutput {
  title: string;
  body: string;
  tags: string[];
  summary: string;
  confidence?: "high" | "medium" | "low";
}

export async function articleFromUrl(input: ArticleFromUrlInput): Promise<ArticleFromUrlOutput> {
  const completion = await grok.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: ARTICLE_FROM_URL_PROMPT },
      { role: "user", content: JSON.stringify(input, null, 2) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.4,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Grok returned empty response");
  return JSON.parse(raw) as ArticleFromUrlOutput;
}

// ============================================================
// 8g. CLEAN UP / REWRITE AN ARTICLE WITH INSTRUCTIONS
// ============================================================

export interface CleanupArticleInput {
  title: string;
  body: string;
  tags: string[];
  instructions: string;     // user's instructions, e.g. "Tighten to 300 words, keep the bullet list"
  repositoryName?: string;
}

export interface CleanupArticleOutput {
  title: string;
  body: string;
  tags: string[];
  changeSummary: string;
}

const CLEANUP_ARTICLE_PROMPT = `You are an editor for a knowledge library.
Given a current article + the editor's instructions, return a revised version.
Keep what the editor likes. Apply only what they asked. Don't invent facts not in the original or implied by the instructions.
Output JSON: {"title", "body", "tags", "changeSummary"}.`;

export async function cleanupArticleWithInstructions(input: CleanupArticleInput): Promise<CleanupArticleOutput> {
  const completion = await grok.chat.completions.create({
    model: MODEL_FAST,
    messages: [
      { role: "system", content: CLEANUP_ARTICLE_PROMPT },
      { role: "user", content: JSON.stringify(input, null, 2) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.4,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Grok returned empty response");
  return JSON.parse(raw) as CleanupArticleOutput;
}

// ============================================================
// 9. EXTRACT KNOWLEDGE ARTICLE METADATA FROM TEXT
// ============================================================

export interface ExtractArticleInput {
  rawText: string;
  repositoryKind: "PRODUCT" | "SALES_SKILL" | "PERSONALITY" | "LEADERSHIP" | "CUSTOM";
  repositoryName: string;
  filename?: string;
}

export interface ExtractArticleOutput {
  title: string;
  body: string;          // cleaned-up body, markdown ok
  tags: string[];        // 3-7 tags
  summary: string;       // one-line gist
}

const EXTRACT_ARTICLE_PROMPT = `You are organizing a knowledge library.
Given raw text (pasted or extracted from a file), produce a clean article entry.
- title: 4-10 words, specific, action-oriented if possible
- body: clean up the raw text into readable markdown. Preserve structure (headings, bullets). Remove fluff. Trim to <=2000 words.
- tags: 3-7 short keyword tags (lowercase, single words preferred)
- summary: one sentence describing what this article teaches

Output strict JSON.`;

export async function extractArticleMetadata(input: ExtractArticleInput): Promise<ExtractArticleOutput> {
  const completion = await grok.chat.completions.create({
    model: MODEL_FAST,
    messages: [
      { role: "system", content: EXTRACT_ARTICLE_PROMPT },
      { role: "user", content: JSON.stringify({
        repositoryKind: input.repositoryKind,
        repositoryName: input.repositoryName,
        filename: input.filename ?? null,
        // Truncate to ~12k chars to stay reasonable on cost/latency
        rawText: input.rawText.slice(0, 12000),
      }, null, 2) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Grok returned empty response");
  return JSON.parse(raw) as ExtractArticleOutput;
}

// ============================================================
// 9. ONE-ON-ONE PREP — analyze a prep doc against an AE profile
// ============================================================

export interface OneOnOnePrepInput {
  // The person being coached. Field name kept as `aeProfile` for backwards
  // compatibility, but it can be a director profile too.
  aeProfile: {
    name: string;
    role?: "AE" | "DIRECTOR";       // default AE
    personalitySummary?: string | null;
    salesStyleSummary?: string | null;       // AE
    leadershipSummary?: string | null;       // director
    forecastingSummary?: string | null;      // director
    communicationSummary?: string | null;
    enneagramType?: string | null;
    discProfile?: string | null;
    mbtiType?: string | null;
    strengths: string[];
    weaknesses: string[];
    skillScores: Array<{ category: string; score: number }>;
    motivations: string[];
  };
  recentNotes?: Array<{ date: string; content: string }>;
  recentReviews?: Array<{ monthOf: string; summary?: string | null }>;
  prepDocText: string;
  productNames?: string[];
  // For directors: aggregate their team
  teamRoster?: Array<{ name: string; topStrength?: string; topGap?: string; lastQuotaPct?: number | null }>;
}

export interface OneOnOnePrepSection {
  title: string;              // section header from the prep doc (e.g. "Pipeline Review")
  bringUp: string;            // what to bring up (1-2 sentences)
  howToBringIt: string;       // tone + style guidance based on personality
  questions: string[];        // 2-4 specific questions for THIS section
  tieToSkill?: string;        // skill score relevance (e.g. "Discovery score 55 — push depth")
  tieToProduct?: string;      // product mastery relevance
  tieToPersonality?: string;  // personality-driven coaching note (DIRECTOR_ONLY territory)
}

export interface OneOnOnePrepOutput {
  summary: string;            // 2-3 sentence overview of the prep doc
  priorities: string[];       // top 3 coaching priorities for THIS 1:1
  sections: OneOnOnePrepSection[];
  watchOuts: string[];        // 1-3 things to avoid given their personality
  closingMove: string;        // how to end the 1:1 strong (1-2 sentences)
}

const ONE_ON_ONE_PREP_PROMPT = `You are an elite coaching strategist preparing a leader for a 1:1 with their direct report.

The report can be either an AE (in which case sales-skill coaching applies) or a Director
(in which case leadership/forecasting coaching applies and the prep should include their team).

INPUT:
- Full report profile: personality summaries, DISC/Enneagram/MBTI, skill scores, strengths, weaknesses, motivations
- Recent coaching notes
- Recent reviews
- A multi-section prep doc the report submitted (text extracted from PDF/DOCX/HTML/TXT)
- For directors: their team roster + per-rep top strength, top gap, last quarter quota %

OUTPUT a strict JSON coaching plan that walks through the prep doc section by section. For each section:
  - title: section heading from the prep doc (preserve their structure)
  - bringUp: what to bring up — markdown allowed (bullets, **bold**, paragraphs)
  - howToBringIt: tone + style guidance based on the AE's personality — markdown allowed
  - questions: array of 2-4 specific questions (plain strings, no markdown)
  - tieToSkill: skill score relevance if there's a clear gap (e.g., "Discovery score 55 — pressure-test their qualification") — markdown allowed
  - tieToProduct: product mastery relevance — markdown allowed (omit if not applicable)
  - tieToPersonality: personality-driven coaching for the director's eyes only — markdown allowed (omit if not applicable)

Markdown style guidance: keep it simple. Use **bold** for emphasis, - for short bullets, paragraphs separated by blank lines. No HTML, no code blocks. 2-4 sentences per field is plenty.

Also produce:
  - summary: 2-3 sentence overview of what the prep doc reveals (plain prose)
  - priorities: top 3 coaching priorities for THIS conversation (plain strings)
  - watchOuts: 1-3 things to avoid given their personality (plain strings)
  - closingMove: how to end the 1:1 with momentum (1-2 sentences, plain prose)

Be concrete. Avoid generic advice. Reference specific skill scores and personality types by name. High-D wants directness; high-S wants warmth; high-C wants data; high-I wants energy.

Output strict JSON.`;

export async function generateOneOnOnePrep(input: OneOnOnePrepInput, modelOverride?: string | null): Promise<OneOnOnePrepOutput> {
  // Use FAST tier — 1:1 prep is structured output (talking points, gaps,
  // closing move) that doesn't need flagship reasoning. Saves ~10x latency
  // vs grok-4-fast-reasoning. Quality has been measurably equivalent on
  // this prompt shape during testing.
  // Per-org override still respected: if an org explicitly chose a heavier
  // model in their settings, we honor it.
  const model = modelOverride && modelOverride.trim() ? modelOverride.trim() : MODEL_FAST;
  const completion = await grok.chat.completions.create({
    model,
    messages: [
      { role: "system", content: ONE_ON_ONE_PREP_PROMPT },
      { role: "user", content: JSON.stringify({
        ...input,
        // Trim more aggressively — every kilobyte of input adds ~100ms.
        prepDocText: input.prepDocText.slice(0, 12000),
      }, null, 2) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.4,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Grok returned empty response");
  return JSON.parse(raw) as OneOnOnePrepOutput;
}

// ============================================================
// 10. CHAT WITH AE PROFILE — interactive deep-dive
// ============================================================

export interface ChatWithProfileInput {
  aeProfile: OneOnOnePrepInput["aeProfile"];
  recentNotes?: Array<{ date: string; content: string }>;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  question: string;
}

const CHAT_WITH_PROFILE_PROMPT = `You are a sales coaching strategist embedded in a coaching platform.
The director or VP is asking you questions about a specific AE.
You have full access to the AE's profile, personality, skill scores, strengths, weaknesses, recent coaching notes.

Be specific, direct, and tie advice back to the AE's actual data. No generic coaching aphorisms.
If asked about something outside the AE's profile, say so and ask a clarifying question.
If asked about personality-driven coaching, share it openly with the director (they're cleared to see it).
Keep answers concise: 2-5 sentences usually, longer only if the question warrants depth.

Format: plain text (no markdown headings). Use short paragraphs.`;

export async function chatWithProfile(input: ChatWithProfileInput): Promise<string> {
  const profileContext = `AE PROFILE\n${JSON.stringify({
    name: input.aeProfile.name,
    personality: {
      enneagramType: input.aeProfile.enneagramType,
      discProfile: input.aeProfile.discProfile,
      mbtiType: input.aeProfile.mbtiType,
    },
    summaries: {
      personality: input.aeProfile.personalitySummary,
      salesStyle: input.aeProfile.salesStyleSummary,
      communication: input.aeProfile.communicationSummary,
    },
    motivations: input.aeProfile.motivations,
    strengths: input.aeProfile.strengths,
    weaknesses: input.aeProfile.weaknesses,
    skillScores: input.aeProfile.skillScores,
  }, null, 2)}\n\nRECENT COACHING NOTES\n${(input.recentNotes ?? []).map((n) => `(${n.date}) ${n.content}`).join("\n") || "None."}`;

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: CHAT_WITH_PROFILE_PROMPT },
    { role: "system", content: profileContext },
    ...input.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: input.question },
  ];

  const completion = await grok.chat.completions.create({
    // Chat is rapid-fire; use the cheap fast tier.
    model: MODEL_FAST,
    messages,
    temperature: 0.5,
  });
  return completion.choices[0]?.message?.content?.trim() ?? "";
}

// ============================================================
// 11. SMART BULK QUESTION GENERATION
// Analyzes existing questions, identifies coverage gaps, and generates
// new questions targeted at specific personality engines or skills.
// ============================================================

export interface SmartBulkInput {
  category: string;
  existingQuestions: Array<{ text: string; tags: string[] }>;
  count: number;                  // 10-100
  coverageTargets?: string[];     // e.g. ["DISC:D", "ENNEAGRAM:8", "MBTI:T", "RESILIENCE", "LEADERSHIP"]
  styleHint?: string;             // e.g. "Sandler methodology", "Challenger Sale"
  context?: {
    productName?: string;
    salesMethodology?: string;
    companyValues?: string[];
  };
  allowedTypes?: Array<"LONG_FORM" | "MULTIPLE_CHOICE" | "LIKERT" | "SLIDER">;
}

export interface SmartBulkAnalysis {
  coverage: Record<string, number>;   // tag → count
  gaps: string[];                     // tags with thin coverage
  recommendation: string;             // 1-line recommendation
}

export interface SmartBulkOutput {
  analysis: SmartBulkAnalysis;
  questions: GeneratedQuestion[];
}

const SMART_BULK_PROMPT = `You are a sales-quiz authoring assistant.

You're given an existing question bank for a specific category, plus the director's request for new questions.

STEP 1 — Analyze coverage of the existing bank by tag (DISC:D, DISC:I, ENNEAGRAM:1..9, MBTI:E/I/S/N/T/F/J/P, skill names).
STEP 2 — Identify gaps relative to coverageTargets. If no coverageTargets are passed, identify the thinnest tags overall.
STEP 3 — Generate 'count' new questions that:
  - Don't duplicate existing ones (compare semantically, not just text)
  - Prioritize the gaps you identified
  - Use a mix of allowedTypes (default LIKERT-heavy for personality categories, MC-heavy for SALES_STYLE)
  - For LIKERT: questionLevel tags should hint at the personality dimension (e.g., ["DISC:C"])
  - For MC: each option's tags should map to a personality side or skill score delta

Output strict JSON:
{
  "analysis": { "coverage": {"DISC:D": 3, "ENNEAGRAM:8": 0, ...}, "gaps": [...], "recommendation": "..." },
  "questions": [{ "text", "questionType", "optionsJson", "tagsJson", "rationale" }]
}

Be specific to the category. For personality categories, write distinctive statements that an LLM can score reliably.`;

export async function generateSmartBulkQuestions(input: SmartBulkInput, modelOverride?: string | null): Promise<SmartBulkOutput> {
  const trimmedExisting = input.existingQuestions.slice(0, 100).map((q) => ({
    text: q.text.slice(0, 200),
    tags: q.tags.slice(0, 8),
  }));
  const completion = await grok.chat.completions.create({
    model: resolveSynthModel(modelOverride),
    messages: [
      { role: "system", content: SMART_BULK_PROMPT },
      { role: "user", content: JSON.stringify({
        ...input,
        existingQuestions: trimmedExisting,
      }, null, 2) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.5,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Grok returned empty response");
  return JSON.parse(raw) as SmartBulkOutput;
}

// ============================================================
// 12. COACHING HINTS — leader-only "how to work with this person"
// ============================================================

export interface CoachingHintsInput {
  name: string;
  role?: "AE" | "DIRECTOR";
  enneagramType?: string | null;
  discProfile?: string | null;
  mbtiType?: string | null;
  personalitySummary?: string | null;
  salesStyleSummary?: string | null;
  leadershipSummary?: string | null;
  communicationSummary?: string | null;
  strengths: string[];
  weaknesses: string[];
  motivations: string[];
  skillScores: Array<{ category: string; score: number }>;
  recentNotes?: Array<{ date: string; content: string }>;
  recentReviewSummaries?: string[];
}

export interface CoachingHintsOutput {
  // Per-field hints — 3-5 short, specific "how to" lines per field
  personality: string[];
  salesStyle: string[];
  communication: string[];
  motivations: string[];
  strengths: string[];
  weaknesses: string[];
  // Holistic narrative — "how I think about this person." Shown at top of
  // Reasoning tab. Markdown allowed (paragraphs, **bold**).
  reasoningSummary: string;
}

const COACHING_HINTS_PROMPT = `You are an elite coaching strategist generating two outputs for the leader of a specific direct report.

OUTPUT 1 — coaching hints (leader-only). For each of 6 fields, 3-5 short hints (1 sentence each):
  - personality (how to communicate, what to expect)
  - salesStyle (how to coach their selling — or leadership for directors)
  - communication (cadence + tone preferences)
  - motivations (what to lean on for engagement)
  - strengths (how to amplify)
  - weaknesses (how to coach growth without crushing them)

OUTPUT 2 — reasoningSummary. A 4-7 sentence holistic narrative explaining HOW you (the AI) think about this person. Tie together personality stack + skill profile + recent notes/reviews/preps + motivations into a unified read. Use markdown (paragraphs, **bold**, bullets). This is "the AI's mental model of this person" — useful for the leader to scan in 30 seconds before any 1:1.

Hints should reference SPECIFIC traits — DISC type, Enneagram type, MBTI, skill scores, named strengths/weaknesses. Avoid generic coaching advice.

Personality nuance matters:
  - Healthy Type 9 (peacemaker) is centered + decisive; unhealthy Type 9 disappears under pressure. Tailor accordingly based on signals.
  - Healthy Type 8 leads with controlled intensity; unhealthy Type 8 dominates and bulldozes.
  - Read recentNotes + recent prep summaries for cues about which version of this person you're dealing with right now.

Tone: direct, practical, no fluff. Hints are things a leader could DO this week.

Output strict JSON:
{
  "personality": [...],
  "salesStyle": [...],
  "communication": [...],
  "motivations": [...],
  "strengths": [...],
  "weaknesses": [...],
  "reasoningSummary": "..."
}`;

export async function generateCoachingHints(input: CoachingHintsInput, _modelOverride?: string | null): Promise<CoachingHintsOutput> {
  // Use FAST tier — these are short structured outputs, no deep reasoning needed.
  // Saves ~10x latency vs flagship and dollars too.
  const completion = await grok.chat.completions.create({
    model: MODEL_FAST,
    messages: [
      { role: "system", content: COACHING_HINTS_PROMPT },
      { role: "user", content: JSON.stringify(input, null, 2) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.4,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Grok returned empty response");
  const parsed = JSON.parse(raw) as Partial<CoachingHintsOutput>;
  // Defensive defaults — if AI omits a field, fill with empty array / string
  return {
    personality:    Array.isArray(parsed.personality)    ? parsed.personality    : [],
    salesStyle:     Array.isArray(parsed.salesStyle)     ? parsed.salesStyle     : [],
    communication:  Array.isArray(parsed.communication)  ? parsed.communication  : [],
    motivations:    Array.isArray(parsed.motivations)    ? parsed.motivations    : [],
    strengths:      Array.isArray(parsed.strengths)      ? parsed.strengths      : [],
    weaknesses:     Array.isArray(parsed.weaknesses)     ? parsed.weaknesses     : [],
    reasoningSummary: typeof parsed.reasoningSummary === "string" ? parsed.reasoningSummary : "",
  };
}

// ============================================================
// 13. PERSONALITY CROSS-COMPARE — leader vs target
// "Given how YOU naturally work, what do you need to adjust to coach THIS person well?"
// ============================================================

interface SidePersona {
  name: string;
  role: "AE" | "DIRECTOR" | "COMPANY_ADMIN" | "ORG_ADMIN" | "VP_SALES";
  enneagramType?: string | null;
  discProfile?: string | null;
  mbtiType?: string | null;
  personalitySummary?: string | null;
  styleSummary?: string | null;        // sales style for AE, leadership for director
  communicationSummary?: string | null;
  strengths: string[];
  weaknesses: string[];
  motivations: string[];
  skillScores: Array<{ category: string; score: number }>;
}

export interface PersonalityCompareInput {
  leader: SidePersona;
  target: SidePersona;
}

export interface PersonalityCompareOutput {
  summary: string;                    // 2-3 sentences on the friction or alignment
  alignedAreas: string[];             // where leader's style serves the target
  frictionPoints: string[];           // where the leader's instincts might miss
  adjustments: {                      // per-field "what you need to flex"
    personality: string[];
    style: string[];
    communication: string[];
    motivations: string[];
    strengths: string[];
    weaknesses: string[];
  };
}

const PERSONALITY_COMPARE_PROMPT = `You are an elite coaching strategist comparing how a LEADER naturally works against the TARGET person they coach.

Goal: help the leader see what THEY need to flex about their own style to coach this person effectively. Frame everything from the leader's perspective — "what you need to do differently."

Output strict JSON:
{
  "summary": "2-3 sentences on natural friction or alignment between the two styles",
  "alignedAreas": ["where the leader's natural style serves this target..."],
  "frictionPoints": ["where the leader's instincts might miss this target..."],
  "adjustments": {
    "personality": ["specific behavioral flexes — 2-4 items"],
    "style": ["sales/leadership-style flexes — 2-4 items"],
    "communication": ["communication-cadence/tone flexes — 2-4 items"],
    "motivations": ["how to engage their motivators differently — 2-4 items"],
    "strengths": ["how to amplify their strengths given your style — 2-4 items"],
    "weaknesses": ["how to coach growth without imposing your patterns — 2-4 items"]
  }
}

Be specific. Reference DISC types, Enneagram types, MBTI letters by name. If the leader is a high-D (driver) coaching a high-S (steady), call that out and tell them what to slow down on. If the leader is Type-3 Achiever coaching a Type-9 Peacemaker, name the friction.

Tone: direct, no fluff. Each item is something the leader could DO this week.`;

export async function generatePersonalityComparison(input: PersonalityCompareInput): Promise<PersonalityCompareOutput> {
  const completion = await grok.chat.completions.create({
    model: MODEL_FAST,
    messages: [
      { role: "system", content: PERSONALITY_COMPARE_PROMPT },
      { role: "user", content: JSON.stringify(input, null, 2) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.4,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Grok returned empty response");
  const parsed = JSON.parse(raw) as Partial<PersonalityCompareOutput>;
  // Defensive defaults
  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    alignedAreas: Array.isArray(parsed.alignedAreas) ? parsed.alignedAreas : [],
    frictionPoints: Array.isArray(parsed.frictionPoints) ? parsed.frictionPoints : [],
    adjustments: {
      personality:    Array.isArray(parsed.adjustments?.personality)    ? parsed.adjustments!.personality    : [],
      style:          Array.isArray(parsed.adjustments?.style)          ? parsed.adjustments!.style          : [],
      communication:  Array.isArray(parsed.adjustments?.communication)  ? parsed.adjustments!.communication  : [],
      motivations:    Array.isArray(parsed.adjustments?.motivations)    ? parsed.adjustments!.motivations    : [],
      strengths:      Array.isArray(parsed.adjustments?.strengths)      ? parsed.adjustments!.strengths      : [],
      weaknesses:     Array.isArray(parsed.adjustments?.weaknesses)     ? parsed.adjustments!.weaknesses     : [],
    },
  };
}

// ============================================================
// 14. AE COMPARE NARRATIVE — "how these AEs differ + where to focus"
// ============================================================

interface AeMini {
  name: string;
  enneagramType?: string | null;
  discProfile?: string | null;
  mbtiType?: string | null;
  strengths: string[];
  weaknesses: string[];
  motivations: string[];
  skillScores: Array<{ category: string; score: number }>;
}

export interface CompareNarrativeOutput {
  summary: string;             // 2-3 sentence overview of the cohort
  contrasts: string[];         // 3-5 specific differences worth coaching toward
  whoToInvestIn: string;       // 1-2 sentences naming which AE has the highest leverage gap
  collectiveTheme: string;     // 1 sentence pattern across the group (if any)
}

const COMPARE_NARRATIVE_PROMPT = `You are a sales coaching strategist comparing 2-4 AEs side-by-side.

Output strict JSON:
{
  "summary": "2-3 sentences naming each AE's archetype and how they cluster or diverge",
  "contrasts": ["3-5 specific differences worth coaching toward — name the AEs by name"],
  "whoToInvestIn": "1-2 sentences identifying the AE with the highest leverage gap and why",
  "collectiveTheme": "1 sentence on a pattern across the group, OR empty string if there isn't one"
}

Tone: direct, specific, no fluff. Reference DISC types, Enneagram types, and skill scores by name. Avoid generic coaching advice — the leader knows the basics.`;

export async function generateCompareNarrative(aes: AeMini[]): Promise<CompareNarrativeOutput> {
  const completion = await grok.chat.completions.create({
    model: MODEL_FAST,
    messages: [
      { role: "system", content: COMPARE_NARRATIVE_PROMPT },
      { role: "user", content: JSON.stringify({ aes }, null, 2) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.4,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Grok returned empty response");
  const parsed = JSON.parse(raw) as Partial<CompareNarrativeOutput>;
  return {
    summary:          typeof parsed.summary === "string" ? parsed.summary : "",
    contrasts:        Array.isArray(parsed.contrasts) ? parsed.contrasts : [],
    whoToInvestIn:    typeof parsed.whoToInvestIn === "string" ? parsed.whoToInvestIn : "",
    collectiveTheme:  typeof parsed.collectiveTheme === "string" ? parsed.collectiveTheme : "",
  };
}

// ============================================================
// 15. SELECT QUIZ QUESTIONS — pick from existing bank to target gaps
// ============================================================

export interface SelectQuizInput {
  aeName: string;
  weaknesses: string[];
  skillScores: Array<{ category: string; score: number }>;
  focusAreas?: string[];           // ["DISCOVERY", "DISC:D"] — optional explicit targets
  candidateQuestions: Array<{ id: string; text: string; tags: string[]; questionType: string; category: string }>;
  count: number;                   // 5-25
}

export interface SelectQuizOutput {
  questionIds: string[];           // ordered, from candidateQuestions
  rationale: string;
}

const SELECT_QUIZ_PROMPT = `You are selecting quiz questions for an ad-hoc skill check-in for a sales rep.

Pick the BEST 'count' questions from the candidate pool to assess the rep's progress on
their weakest skills (or the explicit focusAreas, if given). Prefer diversity — mix question
types if available; don't pick 8 LIKERTs in a row when MC is also available.

Return strict JSON: {"questionIds": [<ids in order>], "rationale": "1-2 sentences"}

Make sure you ONLY use IDs from the candidate pool. Don't invent.`;

export async function selectQuizQuestions(input: SelectQuizInput, modelOverride?: string | null): Promise<SelectQuizOutput> {
  const completion = await grok.chat.completions.create({
    model: resolveSynthModel(modelOverride),
    messages: [
      { role: "system", content: SELECT_QUIZ_PROMPT },
      { role: "user", content: JSON.stringify(input, null, 2) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Grok returned empty response");
  return JSON.parse(raw) as SelectQuizOutput;
}

// ============================================================
// Generic escape hatch
// ============================================================

export async function askGrok(systemPrompt: string, userPayload: string, jsonMode = false) {
  const completion = await grok.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPayload },
    ],
    response_format: jsonMode ? { type: "json_object" } : undefined,
    temperature: 0.3,
  });
  return completion.choices[0]?.message?.content ?? "";
}

// ============================================================
// SKILL BENCHMARK SYNTH — refines "what good looks like" from uploaded files
// ============================================================

export interface SkillBenchmarkSynthInput {
  category: string;            // e.g. "DISCOVERY"
  categoryLabel: string;       // e.g. "Discovery"
  platformDefault: string;     // current platform-default whatGoodLooksLike
  existingOverride?: string | null;  // current org override (if any)
  files: Array<{ filename: string; textPreview: string }>;  // reference materials
  orgName?: string | null;
}

export interface SkillBenchmarkSynthOutput {
  refinedWhatGoodLooksLike: string;   // a single paragraph the admin can accept or edit
  themesObserved: string[];           // 3-5 patterns AI noticed in the files
  evidenceCitations: string[];        // 2-4 quoted snippets from the files supporting the refinement
}

const SKILL_BENCHMARK_SYNTH_PROMPT = `You refine "what good looks like" benchmarks for a sales skill, based on reference files an admin uploaded (call transcripts, top-rep examples, win stories, training docs).

Your job:
1. Read the platform default whatGoodLooksLike paragraph as the baseline.
2. Read the existing override (if present) — preserve what's working.
3. Mine the uploaded files for specific behaviors, language, and patterns that exemplify "world-class" performance for this skill at THIS org.
4. Write a refined whatGoodLooksLike paragraph that's specific to this org — names their stack, their buyers, their motion when relevant. Don't be generic.
5. List 3-5 themes you observed in the files.
6. Pull 2-4 short quoted snippets from the files as evidence.

Output strict JSON:
{
  "refinedWhatGoodLooksLike": "1 paragraph, 3-5 sentences, specific to this org",
  "themesObserved": ["theme 1", "theme 2", ...],
  "evidenceCitations": ["short quote from a file", "another quote", ...]
}

Tone: Direct, confident, operator-style. No corporate fluff.`;

export async function synthesizeSkillBenchmark(input: SkillBenchmarkSynthInput, modelOverride?: string | null): Promise<SkillBenchmarkSynthOutput> {
  // Synth tier — we want quality output the admin will trust enough to publish.
  const model = modelOverride && modelOverride.trim() ? modelOverride.trim() : MODEL_DEFAULT;
  // Trim file text aggressively to keep the prompt under control.
  const trimmedFiles = input.files.map((f) => ({
    filename: f.filename,
    textPreview: f.textPreview.slice(0, 8000),
  }));
  const completion = await grok.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SKILL_BENCHMARK_SYNTH_PROMPT },
      { role: "user", content: JSON.stringify({ ...input, files: trimmedFiles }, null, 2) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Grok returned empty response");
  const parsed = JSON.parse(raw) as Partial<SkillBenchmarkSynthOutput>;
  return {
    refinedWhatGoodLooksLike: parsed.refinedWhatGoodLooksLike || input.platformDefault,
    themesObserved:           Array.isArray(parsed.themesObserved) ? parsed.themesObserved : [],
    evidenceCitations:        Array.isArray(parsed.evidenceCitations) ? parsed.evidenceCitations : [],
  };
}

// ============================================================
// WEEKLY IMPROVEMENT BRIEF — Monday-morning fun-tip email
// ============================================================

export interface WeeklyBriefInput {
  name: string;
  role: "AE" | "DIRECTOR" | "VP_SALES" | "COMPANY_ADMIN" | "ORG_ADMIN";
  enneagramType?: string | null;
  discProfile?: string | null;
  mbtiType?: string | null;
  weakestSkills: Array<{ category: string; score: number }>;  // bottom 2-3
  topStrength?: string;                                        // for the morale boost
  motivations?: string[];
}

export interface WeeklyBriefOutput {
  greeting: string;       // 1 line — warm, energetic, named
  thisWeek: {
    focus: string;        // 1-2 sentence framing of what this week is about
    challenge: string;    // a concrete experiment to try (1-2 sentences)
    miniTip: string;      // a 1-paragraph tactical tip tied to weakest skill + personality
  };
  funFactOrQuote: string; // a short quote or sales psychology fact, related
  closer: string;         // 1 line — encouraging, low-pressure
}

const WEEKLY_BRIEF_PROMPT = `You write the Monday-morning improvement brief for sales professionals. The brief is SHORT, ENERGETIC, and SPECIFIC.

The reader is starting their week — give them ONE thing to focus on, ONE concrete experiment to try, ONE micro-tip, and a short fact or quote that relates. Tie everything to their personality type and weakest skill.

Output strict JSON:
{
  "greeting": "1 line, warm and named",
  "thisWeek": {
    "focus": "1-2 sentences naming the week's improvement theme",
    "challenge": "concrete experiment to try this week, 1-2 sentences",
    "miniTip": "tactical paragraph tied to their weakest skill + personality (3-4 sentences)"
  },
  "funFactOrQuote": "short quote or fact, attribution if quote",
  "closer": "1 line of encouragement"
}

Tone: Friendly, slightly playful, not corporate. Ryan Holiday meets your favorite sales mentor. Reference their personality type by name (e.g. "as a high-D / Type 8...").

Keep it tight. If you write more than 200 words total, you've gone too far.`;

export async function generateWeeklyBrief(input: WeeklyBriefInput, modelOverride?: string | null): Promise<WeeklyBriefOutput> {
  const model = modelOverride && modelOverride.trim() ? modelOverride.trim() : MODEL_FAST;
  const completion = await grok.chat.completions.create({
    model,
    messages: [
      { role: "system", content: WEEKLY_BRIEF_PROMPT },
      { role: "user", content: JSON.stringify(input, null, 2) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,  // higher for variety week-to-week
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Grok returned empty response");
  const parsed = JSON.parse(raw) as Partial<WeeklyBriefOutput>;
  return {
    greeting: parsed.greeting || `Happy Monday, ${input.name.split(" ")[0]}.`,
    thisWeek: {
      focus:     parsed.thisWeek?.focus     || "",
      challenge: parsed.thisWeek?.challenge || "",
      miniTip:   parsed.thisWeek?.miniTip   || "",
    },
    funFactOrQuote: parsed.funFactOrQuote || "",
    closer: parsed.closer || "Make it a great week.",
  };
}

// ============================================================
// COACHING PLAN — multi-week growth plan tied to specific tasks
// ============================================================

export interface CoachingPlanInput {
  name: string;
  role: "AE" | "DIRECTOR" | "VP_SALES" | "COMPANY_ADMIN" | "ORG_ADMIN";
  enneagramType?: string | null;
  discProfile?: string | null;
  mbtiType?: string | null;
  personalitySummary?: string | null;
  strengths: string[];
  weaknesses: string[];
  motivations: string[];
  skillScores: Array<{ category: string; score: number }>;
  recentNotes?: Array<{ date: string; content: string }>;
}

export interface CoachingPlanOutput {
  title: string;                 // short headline like "Sharpen discovery, settle pricing nerves"
  summary: string;               // 2-3 sentence overall framing
  growthAreas: Array<{
    area: string;                // e.g. "Discovery depth"
    why: string;                 // why this matters for THIS person — 1-2 sentences
    weeklyMoves: string[];       // 3-4 concrete weekly actions (will become tasks)
  }>;
  weeklyHabits: string[];        // 3-5 daily/weekly micro-habits
  bookOrPodRecs: Array<{ title: string; author?: string; reason: string }>;
  ninetyDayCheckpoint: string;   // "in 90 days, you should be able to ___"
}

const COACHING_PLAN_PROMPT = `You build personalized growth plans for sales professionals. The plan must be specific to THIS person's personality (DISC, Enneagram, MBTI), their skill scores, their strengths and gaps, and their motivations.

Output strict JSON:
{
  "title": "short headline that names the 1-2 main themes",
  "summary": "2-3 sentence framing — what this plan focuses on and why these areas",
  "growthAreas": [
    {
      "area": "specific skill or behavior name",
      "why": "1-2 sentences — why this matters for THIS person, referencing their personality and current scores",
      "weeklyMoves": ["concrete action 1", "concrete action 2", "concrete action 3"]
    }
  ],
  "weeklyHabits": ["micro-habit 1", "micro-habit 2"],
  "bookOrPodRecs": [{"title": "...", "author": "...", "reason": "..."}],
  "ninetyDayCheckpoint": "1-2 sentences describing what success looks like in 90 days"
}

Write 2-4 growthAreas, 3-5 weeklyHabits, 1-3 bookOrPodRecs.

Be concrete. Avoid generic advice. Reference their type names (e.g. "as a high-D / Type 8...") and specific skill scores. High-D wants directness; high-S wants warmth; high-C wants data; high-I wants energy. Type 8 needs vulnerability work; Type 6 needs permission to act on incomplete info; Type 3 needs to slow down and check in.

The weeklyMoves become real tasks — write them as concrete, completable actions starting with a verb ("Schedule", "Book", "Practice", "Rehearse", "Send", "Read", etc.).`;

export async function generateCoachingPlan(input: CoachingPlanInput, modelOverride?: string | null): Promise<CoachingPlanOutput> {
  // FAST tier — structured output, no flagship reasoning required.
  const model = modelOverride && modelOverride.trim() ? modelOverride.trim() : MODEL_FAST;
  const completion = await grok.chat.completions.create({
    model,
    messages: [
      { role: "system", content: COACHING_PLAN_PROMPT },
      { role: "user", content: JSON.stringify(input, null, 2) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.5,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Grok returned empty response");
  const parsed = JSON.parse(raw) as Partial<CoachingPlanOutput>;
  // Defensive defaults
  return {
    title:               parsed.title || "Your growth plan",
    summary:             parsed.summary || "",
    growthAreas:         Array.isArray(parsed.growthAreas) ? parsed.growthAreas : [],
    weeklyHabits:        Array.isArray(parsed.weeklyHabits) ? parsed.weeklyHabits : [],
    bookOrPodRecs:       Array.isArray(parsed.bookOrPodRecs) ? parsed.bookOrPodRecs : [],
    ninetyDayCheckpoint: parsed.ninetyDayCheckpoint || "",
  };
}
