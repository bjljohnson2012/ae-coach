/**
 * Skill benchmarks — what good looks like for every skill category.
 *
 * Each entry has:
 *   - definition       — what this skill IS in plain language
 *   - scoringRubric    — 4 score bands (40, 60, 80, 95) with concrete behavior at each level
 *   - howScored        — what signals drive the score (intake answers, coaching notes, reviews)
 *   - whatGoodLooksLike — paragraph describing top performers
 *   - howToGrow        — 3-4 concrete coaching moves
 *
 * Used by the clickable score popover on every profile. v3.34 will let
 * each company customize "what good looks like" — those overrides will
 * stack on top of these defaults.
 */

export interface SkillBenchmark {
  category: string;
  label: string;
  definition: string;
  whatGoodLooksLike: string;
  scoringRubric: Array<{ minScore: number; band: string; behavior: string }>;
  howScored: string;
  howToGrow: string[];
}

const SKILLS: Record<string, SkillBenchmark> = {
  // -------- AE skills --------
  DISCOVERY: {
    category: "DISCOVERY",
    label: "Discovery",
    definition:
      "How well the AE uncovers the buyer's real situation, pain, and decision criteria — instead of jumping to demo or pitch.",
    whatGoodLooksLike:
      "Top discoverers run the call. They ask sharp questions that surface unstated pain, identify the economic buyer early, confirm the decision process and paper process, and leave the meeting with a concrete next step locked. They earn the right to recommend by listening first.",
    scoringRubric: [
      { minScore: 95, band: "95+ — World-class",  behavior: "Surfaces unstated pain. Maps full decision tree. MEDDPICC complete by call 2. Buyer feels uniquely understood." },
      { minScore: 80, band: "80–94 — Strong",     behavior: "Asks 8+ open questions per call. Identifies EB and Champion. Confirms paper process. Notes are dense and actionable." },
      { minScore: 60, band: "60–79 — Developing", behavior: "Asks layered questions but sometimes pitches early. Knows the buyer's pain at a surface level. Misses paper process or competition signals." },
      { minScore: 40, band: "40–59 — Foundational", behavior: "Asks closed questions. Talks more than listens. Doesn't probe pain. Walks away missing the EB and decision criteria." },
    ],
    howScored:
      "Calculated from intake answers tagged DISCOVERY, MEDDPICC discipline signals in coaching notes, and director monthly reviews. Weighted toward MEDDPICC questions and the AE's own self-described discovery moves.",
    howToGrow: [
      "Practice the 'pain funnel' — surface, broaden, quantify, personalize",
      "Audit your last 5 lost deals: where did discovery break down?",
      "Record one call per week and listen for question-to-statement ratio (target 60/40 buyer talking)",
      "Use a written deal plan with explicit MEDDPICC fields per deal",
    ],
  },
  OBJECTION_HANDLING: {
    category: "OBJECTION_HANDLING",
    label: "Objection Handling",
    definition:
      "How well the AE responds to pushback — reframing concerns, addressing the real worry beneath the surface, and keeping the conversation moving.",
    whatGoodLooksLike:
      "Strong objection handlers don't get defensive. They name the concern, validate the worry, ask a clarifying question to surface the actual fear, and redirect into a curious follow-up. They've rehearsed reframes for the top 5 objections in their motion.",
    scoringRubric: [
      { minScore: 95, band: "95+ — World-class",  behavior: "Reframes objections into mutual problem-solving. Buyer walks away feeling heard, not pushed. Wins deals others lose." },
      { minScore: 80, band: "80–94 — Strong",     behavior: "Has scripted reframes for top 5 objections. Asks 'what specifically' questions to surface real worry. Closes the loop." },
      { minScore: 60, band: "60–79 — Developing", behavior: "Defends product when challenged. Sometimes wins on logic but loses on rapport. Inconsistent on hard pushback." },
      { minScore: 40, band: "40–59 — Foundational", behavior: "Gets defensive or shuts down. Treats objections as attacks. Ends calls early when challenged." },
    ],
    howScored:
      "Driven by intake answers tagged OBJECTION_HANDLING, role-play scoring, and director feedback after coaching deals.",
    howToGrow: [
      "Build a top-5 objection script library — rehearse weekly with a peer",
      "After every lost deal, write the objection that broke it + a better response",
      "Watch your tone on tough calls — record and review",
      "Practice the 'feel-felt-found' reframe in low-stakes conversations",
    ],
  },
  CLOSING: {
    category: "CLOSING",
    label: "Closing",
    definition:
      "Moving deals across the finish line — pricing conversations, paper process, mutual close plans, and getting signatures.",
    whatGoodLooksLike:
      "Closers set explicit close timelines from call 2. They mutual-close-plan with the buyer and run paper process in parallel with technical eval. They don't over-discount; they qualify the deal until pricing is the only remaining question.",
    scoringRubric: [
      { minScore: 95, band: "95+ — World-class",  behavior: "Forecast accuracy >90%. Mutual close plans live for every late-stage deal. Hits 110% of quota multiple quarters running." },
      { minScore: 80, band: "80–94 — Strong",     behavior: "Predictable closer. Sets timelines early. Negotiates from value. Hits quota." },
      { minScore: 60, band: "60–79 — Developing", behavior: "Closes when momentum is on their side. Slips deals 1-2 weeks per stage. Discounts to close." },
      { minScore: 40, band: "40–59 — Foundational", behavior: "Avoids close conversations. Lets deals drift. Forecast accuracy poor." },
    ],
    howScored:
      "Driven by intake answers tagged CLOSING, quarterly attainment data when available, MEDDPICC paper-process completeness, and forecast-accuracy signals over time.",
    howToGrow: [
      "Mutual-close-plan every deal in last 3 stages — written, shared with buyer",
      "Don't discount more than 10% without bringing it to your director first",
      "Practice the 'soft close' on every discovery call — get a small commitment",
      "Track your close-by-stage timeline and shorten the longest one this quarter",
    ],
  },
  COMMUNICATION: {
    category: "COMMUNICATION",
    label: "Communication",
    definition:
      "Clarity and adaptability across written and verbal — emails, calls, presentations, internal updates, and customer-facing materials.",
    whatGoodLooksLike:
      "Strong communicators write tight emails, run focused meetings, and adapt their style to the audience (executive vs. operator vs. champion). They listen actively, summarize what they heard before responding, and document outcomes.",
    scoringRubric: [
      { minScore: 95, band: "95+ — World-class",  behavior: "Adapts style to any audience. Writes under 100 words and gets responses. Runs 30-min meetings that finish in 25." },
      { minScore: 80, band: "80–94 — Strong",     behavior: "Clear written + verbal. Summarizes and confirms. Tailors examples to buyer." },
      { minScore: 60, band: "60–79 — Developing", behavior: "Effective in their default style; less effective when the audience needs a different one. Long emails." },
      { minScore: 40, band: "40–59 — Foundational", behavior: "Misses tone cues. Buries the lead. Customers don't always understand the next step." },
    ],
    howScored:
      "Intake answers tagged COMMUNICATION, written-sample analysis (where available), and coaching-note feedback.",
    howToGrow: [
      "Cut every email by 30% before sending",
      "Summarize what you heard before responding on every call",
      "Practice the executive summary: 1 sentence problem, 1 sentence ask",
      "Vary your style — mirror DISC of the audience",
    ],
  },
  RESILIENCE: {
    category: "RESILIENCE",
    label: "Resilience",
    definition:
      "How well the AE handles rejection, slumps, and tough quarters without breaking activity discipline.",
    whatGoodLooksLike:
      "Resilient AEs separate self-worth from quota performance. After a no, they move to the next call within minutes. They maintain activity through slumps and treat losses as data, not personal failure.",
    scoringRubric: [
      { minScore: 95, band: "95+ — World-class",  behavior: "Steady through any quarter. Activity holds through slumps. Treats every loss as a learning opportunity." },
      { minScore: 80, band: "80–94 — Strong",     behavior: "Bounces back fast. Maintains weekly rhythm. Asks for help when needed." },
      { minScore: 60, band: "60–79 — Developing", behavior: "Affected by slumps. Activity dips after 3 nos. Recovers with director support." },
      { minScore: 40, band: "40–59 — Foundational", behavior: "Hard losses linger. Activity collapses in tough weeks. Avoids the phone after rejection." },
    ],
    howScored:
      "Intake answers tagged RESILIENCE, attendance + activity-volume signals over time, and how the AE describes their last lost deal.",
    howToGrow: [
      "Build a 'reset ritual' between calls — 60 seconds, deep breath, next number",
      "After a no, write down what you learned (one bullet) before moving on",
      "Set activity floors that don't move regardless of how the week is going",
      "Find a peer for the slump — talking it through cuts recovery in half",
    ],
  },
  PRODUCT_MASTERY: {
    category: "PRODUCT_MASTERY",
    label: "Product Mastery",
    definition:
      "How well the AE knows the product, can demo it, handle technical questions, and tie features to buyer outcomes.",
    whatGoodLooksLike:
      "Top product-masters demo confidently without notes, handle edge-case questions live, and translate features to outcomes the buyer cares about. They're trusted by SEs as a peer, not a babysitter.",
    scoringRubric: [
      { minScore: 95, band: "95+ — World-class",  behavior: "Demos without notes. Handles deep technical Qs in real time. Trusted peer to SEs and product." },
      { minScore: 80, band: "80–94 — Strong",     behavior: "Solid demo skills. Knows top 5 features cold. Brings SE for deep questions but doesn't lean on them." },
      { minScore: 60, band: "60–79 — Developing", behavior: "Demos with notes. Loops in SE often. Some feature gaps." },
      { minScore: 40, band: "40–59 — Foundational", behavior: "Reads from a script. Defers all technical questions. Doesn't tie features to outcomes." },
    ],
    howScored:
      "Intake answers tagged PRODUCT_KNOWLEDGE, product-quiz scores, and ratio of demos run solo vs. with SE.",
    howToGrow: [
      "Run a 5-minute demo on Loom every Monday; share with your director",
      "Pick one feature this week and master it — be the 'go-to' on it",
      "Read every product-launch update; quiz yourself in standup",
      "Shadow an SE on 3 calls per quarter; reciprocate by inviting them on yours",
    ],
  },
  // -------- Director skills --------
  LEADERSHIP: {
    category: "LEADERSHIP",
    label: "Leadership",
    definition:
      "How well the director develops, holds accountable, and gets the best out of their AE team.",
    whatGoodLooksLike:
      "Strong directors run a consistent coaching cadence — weekly 1:1s, monthly reviews, ad-hoc coaching when patterns appear. They make hard decisions on time (PIPs, exits, promotions) and create space for AEs to grow without micromanaging.",
    scoringRubric: [
      { minScore: 95, band: "95+ — World-class",  behavior: "Develops AEs faster than peers. Promotes from within. Hard people calls happen on time. Team morale high through tough quarters." },
      { minScore: 80, band: "80–94 — Strong",     behavior: "Reliable coaching cadence. Direct feedback. AEs improve under their leadership." },
      { minScore: 60, band: "60–79 — Developing", behavior: "Coaches the willing. Slow on hard calls. Prefers process to personal accountability." },
      { minScore: 40, band: "40–59 — Foundational", behavior: "Avoids hard conversations. Inconsistent 1:1s. AEs underperform without intervention." },
    ],
    howScored:
      "Director leadership intake answers tagged LEADERSHIP, monthly review consistency, AE retention + promotion rates, and team skill-score deltas.",
    howToGrow: [
      "Hold every 1:1 — never reschedule unless emergency",
      "Make one hard call this quarter you've been deferring",
      "Ask each AE quarterly: 'what would you change about how I lead you?'",
      "Run a Start/Stop/Continue with your team",
    ],
  },
  FORECASTING: {
    category: "FORECASTING",
    label: "Forecasting",
    definition:
      "Accuracy of the director's quarterly forecast and discipline in re-categorizing deals as they evolve.",
    whatGoodLooksLike:
      "Top forecasters call commits within 5% accuracy quarter after quarter. They re-categorize weekly, drop slipping deals down a tier on schedule, and don't sandbag or oversell to leadership.",
    scoringRubric: [
      { minScore: 95, band: "95+ — World-class",  behavior: "Within 3% accuracy. Most Likely sized realistically. Best Case is genuinely ambitious, not a wish list." },
      { minScore: 80, band: "80–94 — Strong",     behavior: "Within 8% accuracy. Re-categorizes weekly. Honest with leadership." },
      { minScore: 60, band: "60–79 — Developing", behavior: "Optimistic on Most Likely. Best Case inflated. Calls right by week 10 of quarter." },
      { minScore: 40, band: "40–59 — Foundational", behavior: "Forecast misses by 15%+. Doesn't re-categorize. Surprised by misses at quarter end." },
    ],
    howScored:
      "Director leadership intake answers tagged FORECASTING and historical commit-vs-actual variance.",
    howToGrow: [
      "Re-categorize every late-stage deal weekly — public to your AE",
      "Apply the 'two-week slip rule' — anything that slips two weeks drops a tier",
      "Track your quarterly forecast variance and review it with your VP",
      "Run a 'pre-mortem' on every commit deal — what would kill it?",
    ],
  },
};

export function getSkillBenchmark(category: string): SkillBenchmark | null {
  return SKILLS[category] ?? null;
}

export function getAllSkillBenchmarks(): SkillBenchmark[] {
  return Object.values(SKILLS);
}

/**
 * Pick the right rubric band given a numeric score. Always returns one
 * (clamps to the lowest band if score < 40).
 */
export function rubricBandForScore(category: string, score: number): { band: string; behavior: string } | null {
  const bm = getSkillBenchmark(category);
  if (!bm) return null;
  // Bands are descending — first match wins.
  for (const band of bm.scoringRubric) {
    if (score >= band.minScore) return { band: band.band, behavior: band.behavior };
  }
  return bm.scoringRubric[bm.scoringRubric.length - 1];
}
