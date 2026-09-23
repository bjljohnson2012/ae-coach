/**
 * Personality type explainers — DISC, Enneagram, MBTI.
 *
 * Each entry has a short headline (chip label), a 1-paragraph "what it means"
 * description, and a "what it means for sales/coaching" tie-in. Used across
 * profile pages so users can hover/click their type for context.
 *
 * Sources synthesized from primary frameworks (DISC by Marston, Enneagram of
 * Personality, Myers-Briggs MBTI). Sales tie-ins draw on the platform's
 * synthesis SOP and well-known sales-coaching guidance.
 */

export interface TypeExplanation {
  code: string;            // e.g. "D", "7", "ENTJ"
  label: string;           // chip label, e.g. "Driver", "Enthusiast", "Commander"
  summary: string;         // 1-2 sentences — what this type IS
  strengths: string[];     // 3-4 bullets
  watchOuts: string[];     // 3-4 bullets
  inSales: string;         // 1 paragraph — how it shows up in sales / leadership
  coachThem: string;       // 1 paragraph — how to coach this person effectively
}

// ============================================================
// DISC
// ============================================================

export const DISC_TYPES: Record<string, TypeExplanation> = {
  D: {
    code: "D",
    label: "Dominance — Driver",
    summary: "Direct, results-focused, fast-moving. Driven by control, autonomy, and bottom-line outcomes.",
    strengths: [
      "Decisive — moves fast on incomplete info",
      "Comfortable with conflict and tough conversations",
      "Sets aggressive goals and pushes for results",
      "Energized by hard problems and pushback",
    ],
    watchOuts: [
      "Can steamroll quieter team members",
      "Skips rapport-building when it would help",
      "Impatient with longer sales cycles or process",
      "Underweights soft data (relationships, sentiment)",
    ],
    inSales:
      "High-D AEs are aggressive closers. They push for the meeting, push for the demo, push for the signature. They win deals others would let slip — and lose deals where the buyer needed empathy. They make excellent senior-buyer conversations and struggle with mid-management consensus.",
    coachThem:
      "Lead with the bottom line — what's the metric, what's the stake. Don't soften feedback; they prefer direct over diplomatic. Give them autonomy and a clear target; they'll figure out how. Coach them to slow down on discovery and check in with quieter stakeholders.",
  },
  I: {
    code: "I",
    label: "Influence — Charmer",
    summary: "Outgoing, persuasive, optimistic. Energized by people, recognition, and fresh ideas.",
    strengths: [
      "Magnetic — builds rapport in 90 seconds",
      "Strong storyteller, persuasive in real time",
      "Energizes a room and lifts team morale",
      "Excellent on net-new prospecting",
    ],
    watchOuts: [
      "Can lose momentum mid-cycle when detail is needed",
      "Inconsistent on follow-through (forecast accuracy)",
      "Conflict-avoidant when accountability is required",
      "Sometimes oversells — pitch over discovery",
    ],
    inSales:
      "High-I AEs book more meetings than anyone. They turn cold conversations warm. They struggle when the deal moves into MEDDPICC discipline, paper process, or detailed pricing pushback — anywhere the work is unflashy. Best on early-stage; needs structure mid-cycle.",
    coachThem:
      "Open with energy and recognition. Connect the work to a vision they can sell internally. Give them a written deal plan — that's the structure they're missing. Hold them accountable through the boring middle of a deal cycle, with public progress markers.",
  },
  S: {
    code: "S",
    label: "Steadiness — Loyalist",
    summary: "Calm, dependable, methodical. Driven by consistency, harmony, and long-term relationships.",
    strengths: [
      "Customers love them — high renewal rates",
      "Steady through slumps; no drama",
      "Excellent on multi-stakeholder consensus deals",
      "Patient long-term thinker",
    ],
    watchOuts: [
      "Can let deals drift past their natural close date",
      "Under-asserts in tough negotiations",
      "Resistant to abrupt change or reorgs",
      "Slower to qualify out of weak deals",
    ],
    inSales:
      "High-S AEs are the relationship engine of an org. They win deals where multiple stakeholders need to agree. They lose deals where the buyer needed urgency. They're the AE you want on your top 3 strategic accounts — and not the one you put on a 'close it this quarter or kill it' list.",
    coachThem:
      "Open with appreciation for what's working. Frame change as evolution, not disruption. Help them set explicit deadlines so deals don't drift. Coach them on assertive close moves — give them scripts they can use comfortably.",
  },
  C: {
    code: "C",
    label: "Conscientiousness — Analyst",
    summary: "Precise, analytical, evidence-driven. Driven by accuracy, expertise, and getting it right.",
    strengths: [
      "Deep product mastery and technical credibility",
      "Excellent forecast accuracy and MEDDPICC discipline",
      "Wins technical evaluations on merit",
      "Catches risks others miss",
    ],
    watchOuts: [
      "Over-prepares; can be slow to act",
      "Loses to AEs with stronger executive presence",
      "Uncomfortable with ambiguity or emotional buyers",
      "Can over-show the math instead of selling outcomes",
    ],
    inSales:
      "High-C AEs win on credibility. They win the technical buyer, the IT review, the procurement audit. They struggle when the C-suite buyer just wants a confident recommendation, not a spreadsheet. They forecast accurately because they qualify rigorously.",
    coachThem:
      "Bring data to the conversation — they trust frameworks and metrics. Ask their analysis before giving feedback. Give them permission to act on incomplete info; they tend to over-research. Coach them on executive-presence moves: shorter answers, fewer caveats.",
  },
};

// ============================================================
// Enneagram
// ============================================================

export const ENNEAGRAM_TYPES: Record<string, TypeExplanation> = {
  "1": {
    code: "1",
    label: "Type 1 — The Reformer",
    summary: "Principled, perfectionist, driven by integrity and the desire to do things right.",
    strengths: ["High standards and follow-through", "Trustworthy — won't cut corners", "Notices what's broken", "Holds the bar"],
    watchOuts: ["Overly self-critical", "Black-and-white thinking", "Resistant to imperfect-but-shipped work", "Can come across as cold"],
    inSales: "Type 1s qualify rigorously and forecast accurately. They walk away from deals others would close because they refuse to mis-sell. Customers respect their integrity. They sometimes over-qualify — leaving coachable deals on the table.",
    coachThem: "Validate their standards before suggesting trade-offs. Frame coaching as 'how to get it more right,' not 'how to relax.' Give them clear criteria for borderline-deal calls. Avoid public criticism — it lands harder than you'd think.",
  },
  "2": {
    code: "2",
    label: "Type 2 — The Helper",
    summary: "Warm, attentive, motivated by being needed and helping others succeed.",
    strengths: ["Reads emotional state expertly", "Builds deep customer loyalty", "Stakeholder-mapping superstar", "Generous coach to peers"],
    watchOuts: ["Gives away too much in negotiation", "Avoids self-promotion", "Burns out helping everyone", "Conflict-avoidant"],
    inSales: "Type 2s build the deepest customer relationships in the room. Their deals close on relationship strength and renew without drama. Watch their pricing discipline — they tend to discount to keep harmony. They under-credit themselves at quota review.",
    coachThem: "Acknowledge their care for the customer first, then redirect to the business outcome. Coach them on price discipline with a 'what's fair to you' frame. Give them explicit permission to advocate for themselves at promotions and quota credit.",
  },
  "3": {
    code: "3",
    label: "Type 3 — The Achiever",
    summary: "Driven, success-oriented, motivated by visible accomplishment and recognition.",
    strengths: ["Top-of-leaderboard performer", "Adapts style to whoever's in front of them", "Closes hard, fast, and visibly", "High executive presence"],
    watchOuts: ["Optimizes for visible wins over real ones", "Can lose authenticity under pressure", "Neglects unflashy work (long-tail accounts)", "Hides struggle"],
    inSales: "Type 3s top the leaderboard most quarters. They charge into pipeline and close visibly. The risk: they neglect B-tier accounts that don't show up on the board, and they hide problems instead of asking for help.",
    coachThem: "Tie coaching to outcomes, not effort. They respond to scoreboards. Create safe space for them to admit struggle — it goes against their default. Give them long-tail accounts that pay off invisibly; help them see those as part of the win.",
  },
  "4": {
    code: "4",
    label: "Type 4 — The Individualist",
    summary: "Sensitive, expressive, motivated by authenticity and being uniquely seen.",
    strengths: ["Distinctive voice — memorable in cold outreach", "Reads emotional truth in calls", "Wins values-driven buyers (mission orgs, founders)", "Strong storyteller"],
    watchOuts: ["Inconsistent volume — pipeline rises/falls with mood", "Resistant to standardized playbooks", "Takes feedback personally", "Withdrawn when feeling overlooked"],
    inSales: "Type 4s win unique deals others wouldn't see. They're powerful with founders, nonprofits, and mission-driven buyers. Their pipeline is uneven — quarter to quarter swings between big and quiet.",
    coachThem: "Honor their individuality before asking them to follow process. Frame the playbook as the floor, not the ceiling. Help them build activity rituals that decouple output from mood. Public praise lands well; public criticism crushes for days.",
  },
  "5": {
    code: "5",
    label: "Type 5 — The Investigator",
    summary: "Analytical, observant, motivated by competence and depth of understanding.",
    strengths: ["Deep product mastery — knows the tech cold", "Methodical, MEDDPICC-disciplined", "Excellent forecast accuracy", "Trusted technical buyer"],
    watchOuts: ["Slow to act on partial information", "Can over-prepare instead of calling", "Drains in high-emotion conversations", "Quiet in group settings"],
    inSales: "Type 5s win technical evaluations and procurement reviews. They're the AE you put on your most complex enterprise deals. They struggle with C-suite charm calls and emotional buying signals.",
    coachThem: "Send the agenda before the conversation. Ask them to prepare written; debate verbally. Give them frameworks, not just feedback. Coach executive-presence moves explicitly — shorter answers, more confidence in their conclusions.",
  },
  "6": {
    code: "6",
    label: "Type 6 — The Loyalist",
    summary: "Committed, responsible, motivated by security and loyalty to people they trust.",
    strengths: ["Over-prepares — researches everything", "Catches risks others miss", "Loyal team member; sticks through tough quarters", "Process-disciplined"],
    watchOuts: ["Anxious about ambiguity", "Slow ramp on cold opens", "Can freeze on bold asks", "Doubts their own analysis"],
    inSales: "Type 6s are the ones who actually do the homework. They walk into calls knowing the buyer's last earnings call. They struggle with cold opens and high-stakes 'just go for it' moments. Strong on process-heavy verticals.",
    coachThem: "Build trust slowly — they don't extend it freely. Frame asks as 'what could go wrong' not 'what's the upside' (they think in risk). Give them permission to act on 70% confidence. Pair them with a high-D peer for cold opens.",
  },
  "7": {
    code: "7",
    label: "Type 7 — The Enthusiast",
    summary: "Spontaneous, optimistic, motivated by variety, possibility, and avoiding limits.",
    strengths: ["Magnetic energy in cold outreach", "Resilient — bounces back fast from a no", "Books more meetings than anyone", "Multi-stakeholder rapport-builder"],
    watchOuts: ["Loses interest mid-cycle when work gets boring", "Avoids accountability conversations", "Inconsistent follow-up", "Conflict-deflecting"],
    inSales: "Type 7s are the prospecting engine. They open more conversations than the rest of the team combined. The challenge: they lose steam when the deal moves into the boring middle — pricing rounds, paper process, detail. Best with structure layered in.",
    coachThem: "Give them variety — multiple deals, multiple roles. Frame the boring work as 'unlocking the next exciting thing.' Hold accountability through public progress markers. Pair them with a high-C peer for mid-cycle discipline.",
  },
  "8": {
    code: "8",
    label: "Type 8 — The Challenger",
    summary: "Direct, decisive, motivated by control and protecting what matters.",
    strengths: ["Hard-charging closer", "Comfortable with conflict and tough negotiations", "Sets shot-clock deadlines", "Energized by pushback"],
    watchOuts: ["Can rub mid-management the wrong way", "Skips empathy step", "Steamrolls quieter team members", "Hides vulnerability"],
    inSales: "Type 8s close the deals that need a push. They're the AE you put on a wavering C-suite buyer. They struggle in mid-management consensus deals where blunt energy reads as aggressive.",
    coachThem: "Be direct — softening lands as condescension. Coach by debating, not soothing. Give them ownership of a territory; they thrive when they're the boss of the outcome. Help them see soft skills as a tactic, not a weakness.",
  },
  "9": {
    code: "9",
    label: "Type 9 — The Peacemaker",
    summary: "Easygoing, harmonious, motivated by inner and outer peace.",
    strengths: ["Calm under pressure", "Reads conflict early; defuses well", "Multi-stakeholder consensus builder", "Patient long-term thinker"],
    watchOuts: ["Avoids urgency — deals push by 2 weeks per stage", "Under-asserts in negotiation", "Slow to qualify out", "Lets the customer drive"],
    inSales: "Type 9s win consensus-buying motions. They're the AE you put on a deal that requires multiple stakeholders to agree. They lose deals that need a push — buyers stall and they don't apply pressure.",
    coachThem: "Frame coaching as small steps in a clear direction; big change feels destabilizing. Give them concrete urgency scripts they can use comfortably. Help them see that asserting is service to the customer, not aggression.",
  },
};

// ============================================================
// MBTI
// ============================================================

export const MBTI_TYPES: Record<string, TypeExplanation> = {
  INTJ: { code: "INTJ", label: "INTJ — The Architect", summary: "Strategic, independent, system-thinking. Plans long-term and executes deliberately.",
    strengths: ["Big-picture strategist", "Independent operator", "Frameworks-driven", "Plays the long game"],
    watchOuts: ["Impatient with shallow analysis", "Skips relationship-building", "Resists improvisation", "Direct to a fault"],
    inSales: "Wins complex enterprise deals on strategic insight. Builds account plans others wouldn't see. Struggles with high-volume transactional sales motion.",
    coachThem: "Bring data and a thesis, not opinions. Respect their autonomy. Frame coaching as upgrading the system, not the person.",
  },
  INTP: { code: "INTP", label: "INTP — The Logician", summary: "Analytical, curious, theory-driven. Deep thinker who explores possibilities.",
    strengths: ["Sharp analytical mind", "Independent thinker", "Catches logical inconsistencies", "Curious"],
    watchOuts: ["Procrastinates on execution", "Loses interest once problem is solved", "Avoids small talk", "Withdraws under stress"],
    inSales: "Wins on technical depth. Strong with technical buyers. Can drift on follow-up.",
    coachThem: "Give them complex problems. Hold them to deadlines. Pair with an executor for follow-through.",
  },
  ENTJ: { code: "ENTJ", label: "ENTJ — The Commander", summary: "Decisive, strategic, natural leader. Drives change and challenges status quo.",
    strengths: ["Natural commander", "Strategic AND executes", "Comfortable with hard calls", "Builds high-performance teams"],
    watchOuts: ["Can run over slower thinkers", "Impatient with detail", "Underweights emotion", "Workaholic tendencies"],
    inSales: "Top-performing leader. Builds aggressive but disciplined teams. Risk: under-coaches softer reps.",
    coachThem: "Push back hard on their ideas — they respect debate. Frame people skills as performance levers.",
  },
  ENTP: { code: "ENTP", label: "ENTP — The Debater", summary: "Inventive, curious, energized by debate and possibilities.",
    strengths: ["Creative problem-solver", "Quick on their feet", "Reads patterns fast", "Enjoys pushback"],
    watchOuts: ["Bores of execution", "Can argue for sport", "Inconsistent follow-through", "Tunes out routine"],
    inSales: "Wins novel deals others miss. Excellent in competitive deals. Struggles with repetitive sales motions.",
    coachThem: "Give them variety. Hold them to written commitments. Don't take debate personally.",
  },
  INFJ: { code: "INFJ", label: "INFJ — The Advocate", summary: "Insightful, idealistic, motivated by deep meaning and authenticity.",
    strengths: ["Reads emotional truth deeply", "Trusted by mission-driven buyers", "Long-term thinker", "Strong values"],
    watchOuts: ["Burns out giving", "Conflict-avoidant", "Withdraws under stress", "High self-criticism"],
    inSales: "Wins values-aligned deals. Strong with mission-driven orgs. Can struggle with transactional sales.",
    coachThem: "Honor their values frame first. Public criticism stings — keep it private. Protect their energy.",
  },
  INFP: { code: "INFP", label: "INFP — The Mediator", summary: "Idealistic, creative, motivated by authenticity and personal values.",
    strengths: ["Distinctive voice", "Empathic with customers", "Original thinker", "Strong values"],
    watchOuts: ["Inconsistent volume", "Sensitive to feedback", "Avoids confrontation", "Unstructured"],
    inSales: "Wins unique deals that fit their values. Inconsistent quarter to quarter.",
    coachThem: "Frame structure as supporting their authenticity, not constraining it. Public praise; private criticism.",
  },
  ENFJ: { code: "ENFJ", label: "ENFJ — The Protagonist", summary: "Charismatic, idealistic, natural mentor and team builder.",
    strengths: ["Magnetic team builder", "Mentors others naturally", "Strong rapport with everyone", "Reads the room"],
    watchOuts: ["Avoids hard exit conversations", "Takes on too much", "Optimistic forecaster", "Burns out on giving"],
    inSales: "Best-in-class at developing reps. Builds team morale. Risk: hard people calls slip.",
    coachThem: "Help them see hard calls as service to the team. Protect their bandwidth — they over-give.",
  },
  ENFP: { code: "ENFP", label: "ENFP — The Campaigner", summary: "Enthusiastic, creative, energized by people and possibilities.",
    strengths: ["Magnetic in cold outreach", "Storyteller", "Books meetings everywhere", "Resilient"],
    watchOuts: ["Loses momentum mid-cycle", "Inconsistent follow-up", "MEDDPICC discipline weak", "Distracted by new things"],
    inSales: "Top-of-funnel monster. Loses steam in the boring middle of a deal.",
    coachThem: "Give them a written deal plan. Frame structure as 'unlocking the next exciting thing.'",
  },
  ISTJ: { code: "ISTJ", label: "ISTJ — The Logistician", summary: "Practical, fact-driven, reliable. Executes consistently.",
    strengths: ["Process-disciplined", "Reliable forecast accuracy", "Detail-oriented", "Loyal"],
    watchOuts: ["Resists change", "Slow on bold asks", "Can be inflexible", "Quiet in group settings"],
    inSales: "Strong on technical and process-heavy deals. Excellent renewals. Slower on net-new.",
    coachThem: "Frame change as small, well-defined steps. Give them written specs. Don't surprise them.",
  },
  ISFJ: { code: "ISFJ", label: "ISFJ — The Defender", summary: "Warm, dedicated, protective of others. Notices needs and meets them.",
    strengths: ["Customers love them", "Reliable team member", "Detail-oriented care", "Strong loyalty"],
    watchOuts: ["Avoids self-promotion", "Conflict-avoidant", "Burns out helping", "Slow to qualify out"],
    inSales: "Account management star. Trust-built relationships. Weak on net-new prospecting.",
    coachThem: "Acknowledge their care first. Help them assert for themselves. Coach urgency moves explicitly.",
  },
  ESTJ: { code: "ESTJ", label: "ESTJ — The Executive", summary: "Practical, organized, drives results through process.",
    strengths: ["Drives execution", "Organized closer", "Holds team accountable", "Direct"],
    watchOuts: ["Can be rigid", "Pushes process over relationships", "Impatient with creativity", "Direct to a fault"],
    inSales: "Hard-charging closer. Excellent in process-heavy industries.",
    coachThem: "Bring structure and outcomes. Don't argue process — debate the outcome.",
  },
  ESFJ: { code: "ESFJ", label: "ESFJ — The Consul", summary: "Warm, organized, builds team and customer loyalty.",
    strengths: ["Stakeholder mapping superstar", "Empathic", "Organized", "Strong loyalty"],
    watchOuts: ["Pricing discipline weak", "Says yes too much", "Conflict-avoidant", "Self-promotion thin"],
    inSales: "Multi-stakeholder consensus winner. Watch pricing — discounts to keep harmony.",
    coachThem: "Coach price discipline with 'fair to you' frame. Give them explicit credit publicly.",
  },
  ISTP: { code: "ISTP", label: "ISTP — The Virtuoso", summary: "Practical, hands-on, masters tools and tactics.",
    strengths: ["Pragmatic problem-solver", "Calm under pressure", "Independent", "Tool master"],
    watchOuts: ["Avoids long-term planning", "Sparse on follow-up", "Quiet stakeholder", "Resists structure"],
    inSales: "Wins on tactical execution. Strong in technical demos.",
    coachThem: "Give them autonomy and tools. Don't over-process them.",
  },
  ISFP: { code: "ISFP", label: "ISFP — The Adventurer", summary: "Quiet, sensitive, lives by values, dislikes constraint.",
    strengths: ["Authentic", "Empathic", "Values-driven", "Adaptable"],
    watchOuts: ["Avoids planning", "Sensitive to feedback", "Inconsistent volume", "Resistant to structure"],
    inSales: "Wins values-aligned deals. Inconsistent.",
    coachThem: "Frame structure as freedom to do meaningful work. Private feedback only.",
  },
  ESTP: { code: "ESTP", label: "ESTP — The Entrepreneur", summary: "Energetic, action-oriented, thrives in fast-moving deals.",
    strengths: ["Closes hard and fast", "Resilient", "Comfortable with risk", "Excellent in real-time"],
    watchOuts: ["Sparse on prep", "Inconsistent follow-up", "Skips detail", "Status-driven"],
    inSales: "Top performer in fast deals. Struggles in process-heavy enterprise.",
    coachThem: "Give them fast deals and visible wins. Pair with a planner for enterprise.",
  },
  ESFP: { code: "ESFP", label: "ESFP — The Entertainer", summary: "Spontaneous, energetic, lifts the room.",
    strengths: ["Magnetic in person", "Resilient", "Builds rapport fast", "Team morale lift"],
    watchOuts: ["Inconsistent follow-up", "Pricing discipline weak", "Avoids planning", "Distracted"],
    inSales: "Top of funnel. Weak on the boring middle.",
    coachThem: "Variety + structure. Public recognition. Help them see follow-up as a closer move.",
  },
};

/**
 * Lookup helpers — return null if no match (e.g., a combo type like "DC" or
 * "DI" doesn't have a single explainer, but each individual letter does).
 */
export function discExplainer(profile: string | null | undefined): TypeExplanation | null {
  if (!profile) return null;
  const code = profile.trim().toUpperCase().charAt(0);
  return DISC_TYPES[code] ?? null;
}

export function enneagramExplainer(type: string | null | undefined): TypeExplanation | null {
  if (!type) return null;
  // Strip any wing notation: "3w2" → "3"
  const code = type.trim().match(/^[1-9]/)?.[0];
  return code ? ENNEAGRAM_TYPES[code] ?? null : null;
}

export function mbtiExplainer(type: string | null | undefined): TypeExplanation | null {
  if (!type) return null;
  const code = type.trim().toUpperCase();
  return MBTI_TYPES[code] ?? null;
}
