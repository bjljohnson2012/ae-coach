/**
 * Comprehensive baseline question bank.
 *
 * Pattern:
 *  - Generic intake categories (SALES_STYLE, COMMUNICATION, PERSONALITY, MOTIVATION,
 *    RESILIENCE, LEADERSHIP, DIRECTOR_MONTHLY_REVIEW): 10 questions each, mix of
 *    LIKERT, MULTIPLE_CHOICE, LONG_FORM.
 *  - DISC: 10 LIKERT statements per type (D, I, S, C) = 40 questions. Each question
 *    is a strong "agreeing" statement for that type so the LLM can score.
 *  - Enneagram: 10 LIKERT statements per type (1-9) = 90 questions.
 *  - MBTI: 10 LIKERT statements per dichotomy (E vs I, S vs N, T vs F, J vs P) = 40
 *    questions. Each statement leans toward one side and is tagged accordingly.
 *
 * Total: ~240 questions seeded as global (orgId: null) so every org inherits them.
 *
 * Tag conventions read by the LLM during synthesis:
 *  - DISC:D|I|S|C        — DISC type
 *  - ENNEAGRAM:1..9      — Enneagram type
 *  - MBTI:E|I|S|N|T|F|J|P — MBTI dichotomy side
 *  - skill names         — DISCOVERY, OBJECTION_HANDLING, CLOSING, etc.
 *
 * MC option tags can additionally use "+N" or "-N" to weight skill score deltas.
 */

export interface SeedQuestion {
  category:
    | "SALES_STYLE"
    | "COMMUNICATION"
    | "PERSONALITY"
    | "ENNEAGRAM"
    | "DISC"
    | "MBTI"
    | "MOTIVATION"
    | "RESILIENCE"
    | "LEADERSHIP"
    | "DIRECTOR_MONTHLY_REVIEW";
  type: "LONG_FORM" | "MULTIPLE_CHOICE" | "LIKERT" | "SLIDER";
  text: string;
  opts?: Array<{ value: string; label: string; tags: string[] }>;
  tags: string[];
}

// ============================================================
// SALES_STYLE — 10
// ============================================================
const SALES_STYLE: SeedQuestion[] = [
  { category: "SALES_STYLE", type: "MULTIPLE_CHOICE", text: "When opening a discovery call, what's your default move?", opts: [
    { value: "rapport", label: "Build rapport first.", tags: ["COMMUNICATION:+5"] },
    { value: "agenda", label: "Set agenda and outcomes immediately.", tags: ["DISCOVERY:+10"] },
    { value: "diagnose", label: "Open with a sharp diagnostic question.", tags: ["DISCOVERY:+15"] },
    { value: "demo", label: "Get to a demo as fast as possible.", tags: ["PRODUCT_MASTERY:+5"] },
  ], tags: ["DISCOVERY"] },
  { category: "SALES_STYLE", type: "LIKERT", text: "I'd rather lose a deal than push past a real 'no'.", tags: ["RESILIENCE", "OBJECTION_HANDLING"] },
  { category: "SALES_STYLE", type: "LONG_FORM", text: "Walk me through the last deal you closed. What made the difference?", tags: ["CLOSING"] },
  { category: "SALES_STYLE", type: "LIKERT", text: "I prefer running multiple smaller deals over one big one.", tags: ["CLOSING"] },
  { category: "SALES_STYLE", type: "LIKERT", text: "When I sense a deal slipping, I push harder.", tags: ["CLOSING", "RESILIENCE"] },
  { category: "SALES_STYLE", type: "MULTIPLE_CHOICE", text: "How do you handle a stalled deal?", opts: [
    { value: "loop", label: "Loop in a more senior champion.", tags: ["DISCOVERY:+10"] },
    { value: "value", label: "Send something useful (data, article, intro).", tags: ["COMMUNICATION:+10"] },
    { value: "pressure", label: "Apply soft urgency and a deadline.", tags: ["CLOSING:+10"] },
    { value: "wait", label: "Give them space and follow up later.", tags: ["RESILIENCE:+5"] },
  ], tags: ["CLOSING"] },
  { category: "SALES_STYLE", type: "LIKERT", text: "I qualify out aggressively — I'd rather have 5 strong deals than 20 weak ones.", tags: ["DISCOVERY"] },
  { category: "SALES_STYLE", type: "LONG_FORM", text: "Describe your best discovery question and why it works.", tags: ["DISCOVERY"] },
  { category: "SALES_STYLE", type: "MULTIPLE_CHOICE", text: "A prospect goes silent for 10 days. You:", opts: [
    { value: "break", label: "Send a 'breakup' email and let them respond.", tags: ["CLOSING:+5"] },
    { value: "value", label: "Send a relevant data point — no ask.", tags: ["DISCOVERY:+10"] },
    { value: "channel", label: "Try a different channel (LinkedIn, phone, video).", tags: ["COMMUNICATION:+10"] },
    { value: "escalate", label: "Loop in your manager to engage their executive.", tags: ["CLOSING:+10"] },
  ], tags: ["CLOSING", "RESILIENCE"] },
  { category: "SALES_STYLE", type: "LIKERT", text: "I prepare a written deal strategy before each major call.", tags: ["DISCOVERY", "DISC:C"] },
];

// ============================================================
// COMMUNICATION — 10
// ============================================================
const COMMUNICATION: SeedQuestion[] = [
  { category: "COMMUNICATION", type: "LIKERT", text: "I summarize what I heard before responding.", tags: ["COMMUNICATION"] },
  { category: "COMMUNICATION", type: "LIKERT", text: "I prefer writing tough feedback over saying it live.", tags: ["COMMUNICATION"] },
  { category: "COMMUNICATION", type: "LIKERT", text: "I get to the point quickly in meetings.", tags: ["COMMUNICATION", "DISC:D"] },
  { category: "COMMUNICATION", type: "LIKERT", text: "I tell stories more than I cite data.", tags: ["COMMUNICATION", "DISC:I"] },
  { category: "COMMUNICATION", type: "LONG_FORM", text: "Describe a time you handled a tense conversation well.", tags: ["COMMUNICATION", "OBJECTION_HANDLING"] },
  { category: "COMMUNICATION", type: "MULTIPLE_CHOICE", text: "When someone interrupts you, what's your reflex?", opts: [
    { value: "yield", label: "Yield and let them finish.", tags: ["DISC:S", "COMMUNICATION:+5"] },
    { value: "redirect", label: "Acknowledge, then bring it back.", tags: ["COMMUNICATION:+10"] },
    { value: "hold", label: "Hold my line and keep going.", tags: ["DISC:D"] },
    { value: "pivot", label: "Shift to their topic — they cared enough to speak up.", tags: ["DISC:I"] },
  ], tags: ["COMMUNICATION"] },
  { category: "COMMUNICATION", type: "LIKERT", text: "Silence in a conversation makes me uncomfortable.", tags: ["COMMUNICATION", "DISC:I"] },
  { category: "COMMUNICATION", type: "LIKERT", text: "I rehearse important calls in advance.", tags: ["COMMUNICATION", "DISC:C"] },
  { category: "COMMUNICATION", type: "MULTIPLE_CHOICE", text: "How do you give bad news?", opts: [
    { value: "direct", label: "Lead with it. No softening.", tags: ["DISC:D", "COMMUNICATION:+5"] },
    { value: "context", label: "Set context first, then deliver.", tags: ["COMMUNICATION:+10"] },
    { value: "soft", label: "Cushion it with empathy and options.", tags: ["DISC:S", "COMMUNICATION:+5"] },
    { value: "data", label: "Lead with data, let it speak.", tags: ["DISC:C"] },
  ], tags: ["COMMUNICATION"] },
  { category: "COMMUNICATION", type: "LONG_FORM", text: "What's your move when a customer raises their voice?", tags: ["COMMUNICATION", "RESILIENCE"] },
];

// ============================================================
// PERSONALITY (broad, multi-dimensional) — 10
// ============================================================
const PERSONALITY: SeedQuestion[] = [
  { category: "PERSONALITY", type: "LIKERT", text: "I get energy from being around people.", tags: ["MBTI:E", "DISC:I"] },
  { category: "PERSONALITY", type: "LIKERT", text: "I trust gut feelings as much as data.", tags: ["MBTI:N"] },
  { category: "PERSONALITY", type: "LIKERT", text: "I'd rather be respected than liked.", tags: ["MBTI:T", "DISC:D"] },
  { category: "PERSONALITY", type: "LIKERT", text: "I work best with a clear plan.", tags: ["MBTI:J", "DISC:C"] },
  { category: "PERSONALITY", type: "LIKERT", text: "I notice details others miss.", tags: ["DISC:C", "MBTI:S"] },
  { category: "PERSONALITY", type: "LIKERT", text: "Routine bores me; I crave new challenges.", tags: ["MBTI:N", "DISC:I"] },
  { category: "PERSONALITY", type: "LIKERT", text: "I make decisions slowly to make them well.", tags: ["DISC:S", "MBTI:J"] },
  { category: "PERSONALITY", type: "LONG_FORM", text: "How do you respond when someone challenges your idea publicly?", tags: ["RESILIENCE"] },
  { category: "PERSONALITY", type: "MULTIPLE_CHOICE", text: "Your colleagues would describe you as:", opts: [
    { value: "driver", label: "A driver — gets things done fast.", tags: ["DISC:D", "MBTI:T"] },
    { value: "spark", label: "The spark — energy and ideas.", tags: ["DISC:I", "MBTI:E"] },
    { value: "rock", label: "The rock — steady and reliable.", tags: ["DISC:S", "MBTI:F"] },
    { value: "analyst", label: "The analyst — careful and precise.", tags: ["DISC:C", "MBTI:T"] },
  ], tags: ["PERSONALITY"] },
  { category: "PERSONALITY", type: "LIKERT", text: "I find it easy to admit when I'm wrong.", tags: ["RESILIENCE", "PERSONALITY"] },
];

// ============================================================
// MOTIVATION — 10
// ============================================================
const MOTIVATION: SeedQuestion[] = [
  { category: "MOTIVATION", type: "MULTIPLE_CHOICE", text: "What gets you out of bed in the morning?", opts: [
    { value: "money", label: "Hitting big numbers.", tags: ["MOTIVATION:money", "CLOSING:+5"] },
    { value: "mastery", label: "Getting better at the craft.", tags: ["MOTIVATION:mastery", "PRODUCT_MASTERY:+10"] },
    { value: "impact", label: "Helping customers solve real problems.", tags: ["MOTIVATION:impact", "DISCOVERY:+10"] },
    { value: "recognition", label: "Being recognized for top performance.", tags: ["MOTIVATION:recognition"] },
    { value: "team", label: "Building and supporting a team.", tags: ["MOTIVATION:team"] },
  ], tags: ["MOTIVATION"] },
  { category: "MOTIVATION", type: "LONG_FORM", text: "Describe what 'success in your career' looks like in 3 years.", tags: ["MOTIVATION"] },
  { category: "MOTIVATION", type: "LIKERT", text: "Public recognition matters to me more than money.", tags: ["MOTIVATION:recognition"] },
  { category: "MOTIVATION", type: "LIKERT", text: "I'd take a pay cut for a job that mattered more.", tags: ["MOTIVATION:impact"] },
  { category: "MOTIVATION", type: "LIKERT", text: "I'm fueled more by learning than by closing.", tags: ["MOTIVATION:mastery"] },
  { category: "MOTIVATION", type: "LIKERT", text: "Beating last quarter is what drives me most.", tags: ["MOTIVATION:money", "CLOSING"] },
  { category: "MOTIVATION", type: "LIKERT", text: "Helping a teammate hit their number feels as good as hitting mine.", tags: ["MOTIVATION:team", "DISC:S"] },
  { category: "MOTIVATION", type: "LIKERT", text: "Autonomy matters more to me than pay.", tags: ["MOTIVATION:autonomy"] },
  { category: "MOTIVATION", type: "MULTIPLE_CHOICE", text: "Which would frustrate you most?", opts: [
    { value: "cap", label: "A commission cap.", tags: ["MOTIVATION:money"] },
    { value: "micro", label: "Being micromanaged.", tags: ["MOTIVATION:autonomy"] },
    { value: "stale", label: "Repeating the same playbook for years.", tags: ["MOTIVATION:mastery"] },
    { value: "anon", label: "Doing great work no one notices.", tags: ["MOTIVATION:recognition"] },
  ], tags: ["MOTIVATION"] },
  { category: "MOTIVATION", type: "LIKERT", text: "I'm willing to grind through bad weeks if the long-term payoff is clear.", tags: ["MOTIVATION", "RESILIENCE"] },
];

// ============================================================
// RESILIENCE — 10
// ============================================================
const RESILIENCE: SeedQuestion[] = [
  { category: "RESILIENCE", type: "LIKERT", text: "After a bad call, I bounce back within an hour.", tags: ["RESILIENCE"] },
  { category: "RESILIENCE", type: "LIKERT", text: "I see rejection as data, not personal.", tags: ["RESILIENCE", "OBJECTION_HANDLING"] },
  { category: "RESILIENCE", type: "LONG_FORM", text: "Tell me about a deal you lost. What did you take from it?", tags: ["RESILIENCE", "CLOSING"] },
  { category: "RESILIENCE", type: "LIKERT", text: "I keep my activity levels steady through slumps.", tags: ["RESILIENCE"] },
  { category: "RESILIENCE", type: "LIKERT", text: "I separate self-worth from quota performance.", tags: ["RESILIENCE"] },
  { category: "RESILIENCE", type: "MULTIPLE_CHOICE", text: "After 3 no's in a row you usually:", opts: [
    { value: "double", label: "Double down on activity.", tags: ["RESILIENCE:+10"] },
    { value: "audit", label: "Audit the playbook for gaps.", tags: ["RESILIENCE:+10", "PRODUCT_MASTERY:+5"] },
    { value: "vent", label: "Vent to your director and reset.", tags: ["RESILIENCE:+5"] },
    { value: "freeze", label: "Avoid the phone for the rest of the day.", tags: ["RESILIENCE:-10"] },
  ], tags: ["RESILIENCE"] },
  { category: "RESILIENCE", type: "LIKERT", text: "I sleep well even during a tough quarter.", tags: ["RESILIENCE"] },
  { category: "RESILIENCE", type: "LIKERT", text: "Setbacks make me more determined, not less.", tags: ["RESILIENCE"] },
  { category: "RESILIENCE", type: "LONG_FORM", text: "What's your routine for resetting after a hard day?", tags: ["RESILIENCE"] },
  { category: "RESILIENCE", type: "LIKERT", text: "I ask for help before I'm overwhelmed.", tags: ["RESILIENCE", "COMMUNICATION"] },
];

// ============================================================
// LEADERSHIP (director intake) — 10
// ============================================================
const LEADERSHIP: SeedQuestion[] = [
  { category: "LEADERSHIP", type: "LONG_FORM", text: "When a deal goes sideways, where do you focus first?", tags: ["LEADERSHIP"] },
  { category: "LEADERSHIP", type: "LIKERT", text: "I categorize forecast deals conservatively.", tags: ["FORECASTING"] },
  { category: "LEADERSHIP", type: "LIKERT", text: "I prefer to coach with questions rather than answers.", tags: ["LEADERSHIP"] },
  { category: "LEADERSHIP", type: "LIKERT", text: "I trust my AEs' forecast calls without much pressure-testing.", tags: ["FORECASTING"] },
  { category: "LEADERSHIP", type: "MULTIPLE_CHOICE", text: "Your top performer goes into a 2-month slump. First move:", opts: [
    { value: "diagnose", label: "Sit on calls with them and diagnose.", tags: ["LEADERSHIP:+15"] },
    { value: "metrics", label: "Pull activity metrics and confront the gap.", tags: ["LEADERSHIP:+5", "FORECASTING:+10"] },
    { value: "personal", label: "Have a 1:1 to check on personal life.", tags: ["LEADERSHIP:+10", "DISC:S"] },
    { value: "wait", label: "Trust them to figure it out — top reps are self-correcting.", tags: ["LEADERSHIP:-5"] },
  ], tags: ["LEADERSHIP"] },
  { category: "LEADERSHIP", type: "LIKERT", text: "I deliver hard feedback the same day I see the issue.", tags: ["LEADERSHIP", "COMMUNICATION"] },
  { category: "LEADERSHIP", type: "LONG_FORM", text: "What's your weekly forecast cadence?", tags: ["FORECASTING"] },
  { category: "LEADERSHIP", type: "LIKERT", text: "I let AEs own their territory strategy with light oversight.", tags: ["LEADERSHIP"] },
  { category: "LEADERSHIP", type: "MULTIPLE_CHOICE", text: "An AE misses their number two quarters running. You:", opts: [
    { value: "pip", label: "Put them on a formal performance plan.", tags: ["LEADERSHIP:+10"] },
    { value: "coach", label: "Double the coaching time and reset goals.", tags: ["LEADERSHIP:+15"] },
    { value: "reassign", label: "Reassign accounts to set them up to win.", tags: ["LEADERSHIP:+5", "DISC:S"] },
    { value: "exit", label: "Begin a respectful exit conversation.", tags: ["LEADERSHIP:+5", "DISC:D"] },
  ], tags: ["LEADERSHIP"] },
  { category: "LEADERSHIP", type: "LIKERT", text: "I'd rather promote internal talent than hire externally.", tags: ["LEADERSHIP"] },
];

// ============================================================
// DIRECTOR_MONTHLY_REVIEW — 10
// ============================================================
const DIRECTOR_MONTHLY_REVIEW: SeedQuestion[] = [
  { category: "DIRECTOR_MONTHLY_REVIEW", type: "LIKERT", text: "How effective was this AE at discovery this month?", tags: ["DISCOVERY"] },
  { category: "DIRECTOR_MONTHLY_REVIEW", type: "LIKERT", text: "How well did they handle objections you observed?", tags: ["OBJECTION_HANDLING"] },
  { category: "DIRECTOR_MONTHLY_REVIEW", type: "LIKERT", text: "How is their product knowledge trending?", tags: ["PRODUCT_MASTERY"] },
  { category: "DIRECTOR_MONTHLY_REVIEW", type: "LONG_FORM", text: "Describe one win and one stumble this month.", tags: ["RESILIENCE"] },
  { category: "DIRECTOR_MONTHLY_REVIEW", type: "LONG_FORM", text: "What should we focus on coaching next month?", tags: [] },
  { category: "DIRECTOR_MONTHLY_REVIEW", type: "LIKERT", text: "Their forecast accuracy this month was strong.", tags: ["FORECASTING"] },
  { category: "DIRECTOR_MONTHLY_REVIEW", type: "LIKERT", text: "Their activity volume hit our weekly targets.", tags: ["RESILIENCE", "DISCOVERY"] },
  { category: "DIRECTOR_MONTHLY_REVIEW", type: "LIKERT", text: "They followed up on coaching feedback from last month.", tags: ["RESILIENCE", "COMMUNICATION"] },
  { category: "DIRECTOR_MONTHLY_REVIEW", type: "MULTIPLE_CHOICE", text: "Top coaching priority next month:", opts: [
    { value: "discovery", label: "Discovery depth.", tags: ["DISCOVERY:+10"] },
    { value: "objection", label: "Objection handling.", tags: ["OBJECTION_HANDLING:+10"] },
    { value: "closing", label: "Closing momentum.", tags: ["CLOSING:+10"] },
    { value: "product", label: "Product mastery.", tags: ["PRODUCT_MASTERY:+10"] },
    { value: "resilience", label: "Resilience / mindset.", tags: ["RESILIENCE:+10"] },
  ], tags: [] },
  { category: "DIRECTOR_MONTHLY_REVIEW", type: "LONG_FORM", text: "Any flags about their wellbeing or motivation?", tags: ["RESILIENCE"] },
];

// ============================================================
// DISC — 10 LIKERT statements per type × 4 types = 40 questions
// ============================================================
function discQuestions(): SeedQuestion[] {
  const D = [
    "I make decisions quickly with limited information.",
    "I get impatient with long process.",
    "I'd rather act and adjust than plan and stall.",
    "I push back hard when I disagree.",
    "I take charge when no one else is leading.",
    "I'd rather be respected than liked.",
    "I cut through politics to get the answer.",
    "Slow meetings drain me.",
    "I set ambitious goals others find unrealistic.",
    "I confront problems head-on rather than tiptoeing.",
  ];
  const I = [
    "I love brainstorming with a group.",
    "I bring energy and optimism into a room.",
    "I'd rather pitch my idea verbally than send a memo.",
    "I make friends easily with prospects.",
    "I lose interest in details quickly.",
    "I prefer collaboration over solo work.",
    "I'm more persuasive in person than on paper.",
    "I get excited about new opportunities easily.",
    "I'd rather influence than analyze.",
    "I tell stories more than I cite data.",
  ];
  const S = [
    "I value loyalty and steady relationships.",
    "I dislike abrupt change.",
    "I'm patient with people learning the ropes.",
    "I'd rather support a teammate than chase a spotlight.",
    "I prefer predictable outcomes over high-risk wins.",
    "Conflict drains me; harmony energizes me.",
    "I'm the person teammates come to for steady advice.",
    "I follow through on commitments without reminders.",
    "I'd rather build a long account than close a fast one.",
    "Disruption to the team makes me uneasy.",
  ];
  const C = [
    "I trust my analysis over others' opinions.",
    "I want hard data before committing to a position.",
    "I double-check work others have already approved.",
    "I prefer written specs over verbal direction.",
    "I'm uncomfortable answering without verifying first.",
    "I notice errors others miss.",
    "I prefer accuracy over speed.",
    "I research thoroughly before making a recommendation.",
    "I'd rather be right than fast.",
    "I think in frameworks and systems.",
  ];
  const out: SeedQuestion[] = [];
  D.forEach((t) => out.push({ category: "DISC", type: "LIKERT", text: t, tags: ["DISC:D"] }));
  I.forEach((t) => out.push({ category: "DISC", type: "LIKERT", text: t, tags: ["DISC:I"] }));
  S.forEach((t) => out.push({ category: "DISC", type: "LIKERT", text: t, tags: ["DISC:S"] }));
  C.forEach((t) => out.push({ category: "DISC", type: "LIKERT", text: t, tags: ["DISC:C"] }));
  return out;
}

// ============================================================
// ENNEAGRAM — 10 LIKERT statements per type × 9 types = 90 questions
// ============================================================
function enneagramQuestions(): SeedQuestion[] {
  const T1 = [ // The Reformer
    "I notice when something is wrong before I notice when something is right.",
    "Doing things the right way matters more to me than doing them fast.",
    "I have a strong inner critic that pushes me to improve.",
    "I get frustrated when colleagues cut corners.",
    "I hold myself to a higher standard than I hold others.",
    "Sloppy work bothers me more than it should.",
    "I want to leave things better than I found them.",
    "I struggle to relax when there's still work to do.",
    "I value integrity more than results.",
    "I feel responsible for fixing things that aren't my job.",
  ];
  const T2 = [ // The Helper
    "I notice what people need before they ask.",
    "I feel best about myself when I'm helping someone.",
    "I have trouble saying no when someone needs me.",
    "I can read a room's mood instantly.",
    "I'd rather be needed than admired.",
    "I take on others' problems as if they were mine.",
    "Being seen as unhelpful would devastate me.",
    "I give more than I ask for in return.",
    "I struggle to recognize my own needs.",
    "Relationships are the most important part of my work.",
  ];
  const T3 = [ // The Achiever
    "I feel my worth is tied to my performance.",
    "I push hard for visible wins.",
    "I'm conscious of how I'm perceived at all times.",
    "Failure in front of others would hit me harder than failure in private.",
    "I adapt my style to whoever I'm in front of.",
    "Trophies, leaderboards, and rankings motivate me.",
    "I'd rather be seen as successful than satisfied.",
    "I move on quickly from emotions to keep performing.",
    "I'm uncomfortable with prolonged unproductive time.",
    "I enjoy being the top performer.",
  ];
  const T4 = [ // The Individualist
    "I want to be uniquely seen, not blended in.",
    "I notice when something feels off in a way others don't.",
    "I'm drawn to depth and meaning more than convention.",
    "Being ordinary feels worse than being wrong.",
    "I feel emotions more intensely than most people around me.",
    "I'm a bit jealous when others have what I don't.",
    "I'd rather be authentic than be agreeable.",
    "I can romanticize what's missing in my life.",
    "I sometimes feel like an outsider even on a close team.",
    "Beauty, design, and aesthetics matter to my work.",
  ];
  const T5 = [ // The Investigator
    "I need significant alone time to recharge.",
    "I'd rather observe and analyze than jump in.",
    "I conserve my energy and parcel it out carefully.",
    "I'd rather know more about a topic than most people in the room.",
    "Demands on my attention drain me quickly.",
    "I feel competent only after I've mastered the material.",
    "I'm uncomfortable being put on the spot without prep.",
    "I prefer depth over breadth.",
    "I'd rather work alone than collaborate live.",
    "I don't share my work until it's ready.",
  ];
  const T6 = [ // The Loyalist
    "I scan for what could go wrong before what could go right.",
    "I feel safer when I've prepared for every contingency.",
    "I'm loyal to a fault to people and organizations I trust.",
    "I'm wary of authority figures who haven't earned my trust.",
    "I doubt my own judgment even after I've decided.",
    "I'd rather over-prepare than under-prepare.",
    "I imagine worst-case scenarios more than I'd like.",
    "I value people who keep their commitments.",
    "I'd rather be cautious than be embarrassed.",
    "Ambiguity makes me anxious.",
  ];
  const T7 = [ // The Enthusiast
    "I love variety; sticking with one thing feels limiting.",
    "I can reframe almost any setback into a positive.",
    "I struggle with sustained boring work.",
    "I keep multiple options open at all times.",
    "I'd rather start something new than finish something old.",
    "I avoid sitting with painful emotions.",
    "I'm an idea-generator more than an executor.",
    "Limits feel like cages to me.",
    "I'm energized by what's coming next, not what just happened.",
    "I have more enthusiasm than discipline.",
  ];
  const T8 = [ // The Challenger
    "I'm more comfortable taking charge than being told what to do.",
    "I respect people who push back on me.",
    "I confront issues directly even when it's uncomfortable.",
    "I'd rather be feared than disrespected.",
    "I'm protective of people I care about.",
    "I instinctively distrust authority I haven't tested.",
    "I move into a vacuum of leadership without thinking.",
    "I make my position known without softening it.",
    "I'm energized by controlled conflict.",
    "I take on big challenges others avoid.",
  ];
  const T9 = [ // The Peacemaker
    "I avoid conflict to keep relationships smooth.",
    "I see all sides of an issue, often to my own detriment.",
    "I have a hard time stating what I want directly.",
    "I numb out when things get tense.",
    "I prefer harmony over honesty in the moment.",
    "I procrastinate on decisions that might upset people.",
    "I'm steady and calm under pressure.",
    "I lose myself in others' priorities easily.",
    "I'd rather merge with the group than stand out.",
    "I forget about my own anger until much later.",
  ];

  const out: SeedQuestion[] = [];
  const all: Array<[number, string[]]> = [
    [1, T1], [2, T2], [3, T3], [4, T4], [5, T5], [6, T6], [7, T7], [8, T8], [9, T9],
  ];
  for (const [n, list] of all) {
    list.forEach((t) => out.push({
      category: "ENNEAGRAM",
      type: "LIKERT",
      text: t,
      tags: [`ENNEAGRAM:${n}`],
    }));
  }
  return out;
}

// ============================================================
// MBTI — 10 LIKERT per dichotomy axis × 4 axes = 40 questions
// Each question is phrased to lean toward ONE side of the axis;
// agreeing strongly = that side, disagreeing strongly = the other.
// ============================================================
function mbtiQuestions(): SeedQuestion[] {
  const E = [ // Extraversion
    "I get energy from being around people.",
    "I think out loud rather than internally.",
    "I'd rather talk through a problem with someone than journal alone.",
    "I'm energized by group brainstorming.",
    "I prefer working in a room full of people.",
    "After a long day, I want to be with friends.",
    "I'm comfortable being the center of attention.",
    "I share my opinions readily.",
    "I'd rather have a busy social calendar than a quiet one.",
    "I tend to act first and reflect later.",
  ];
  const I = [ // Introversion
    "After a long week, I recharge by being alone.",
    "I prefer to think through things internally before speaking.",
    "Small talk drains me.",
    "I do my best work in solitude.",
    "I prefer a small group of close colleagues to a wide network.",
    "I avoid being the center of attention.",
    "I rehearse what I want to say before saying it.",
    "Crowds wear me out.",
    "I share my thoughts only after I'm sure of them.",
    "I'd rather observe than participate at large events.",
  ];
  const S = [ // Sensing
    "I trust facts and direct experience more than theories.",
    "I'd rather have a step-by-step playbook than a strategy outline.",
    "I notice details others miss.",
    "I prefer concrete examples over abstract concepts.",
    "I'm focused on what's happening now more than what could happen.",
    "I follow proven processes rather than improvising.",
    "I'd rather demo a feature than discuss it.",
    "I work with what's in front of me, not what might be.",
    "Practical implications matter more to me than possibilities.",
    "I prefer specifics over generalities.",
  ];
  const N = [ // iNtuition
    "I notice possibilities and patterns more than facts.",
    "I trust gut feelings as much as data.",
    "I'm energized by abstract ideas.",
    "I see connections others don't.",
    "I'd rather strategize than execute the routine.",
    "I get bored by detailed how-to instructions.",
    "I think more about future scenarios than present details.",
    "I love brainstorming what could be.",
    "I'd rather invent something than maintain something.",
    "Theory excites me more than practice.",
  ];
  const T = [ // Thinking
    "I'd rather be respected than liked.",
    "I make decisions with my head more than my heart.",
    "Logic should win over feelings in business decisions.",
    "I'm comfortable giving direct critical feedback.",
    "I focus on what's correct, not what's comfortable.",
    "I evaluate arguments on merit, not on who made them.",
    "I value fairness over harmony.",
    "I separate the issue from the person easily.",
    "I'd rather solve a problem than soothe a feeling.",
    "I'm willing to make unpopular calls.",
  ];
  const F = [ // Feeling
    "I make decisions with my heart more than my head.",
    "I weigh impact on people heavily in any choice.",
    "I'd rather keep someone's morale up than win an argument.",
    "I'm more sensitive to other people's emotions than most.",
    "Harmony matters as much as outcomes.",
    "I can't separate the message from the messenger easily.",
    "I take feedback personally.",
    "I'd rather negotiate to keep the relationship intact.",
    "Compassion drives many of my decisions.",
    "I'd rather be liked than be right.",
  ];
  const J = [ // Judging
    "I live by the calendar, not the moment.",
    "I work best with a clear plan.",
    "I prefer to decide and move on rather than keep options open.",
    "Deadlines energize me.",
    "I get uncomfortable with loose ends.",
    "I'd rather close a decision than revisit it.",
    "I make to-do lists daily.",
    "Order calms me.",
    "I plan vacations down to the meal.",
    "I prefer routines over surprises.",
  ];
  const P = [ // Perceiving
    "I'd rather have a flexible plan than a fixed one.",
    "I keep my options open as long as possible.",
    "Last-minute changes don't bother me.",
    "I work in bursts rather than steady output.",
    "I procrastinate but somehow get things done.",
    "I'd rather explore than commit.",
    "I find rigid schedules constraining.",
    "I adapt easily when plans fall through.",
    "I'm comfortable with messy desks and open files.",
    "I leave room for serendipity.",
  ];
  const out: SeedQuestion[] = [];
  E.forEach((t) => out.push({ category: "MBTI", type: "LIKERT", text: t, tags: ["MBTI:E"] }));
  I.forEach((t) => out.push({ category: "MBTI", type: "LIKERT", text: t, tags: ["MBTI:I"] }));
  S.forEach((t) => out.push({ category: "MBTI", type: "LIKERT", text: t, tags: ["MBTI:S"] }));
  N.forEach((t) => out.push({ category: "MBTI", type: "LIKERT", text: t, tags: ["MBTI:N"] }));
  T.forEach((t) => out.push({ category: "MBTI", type: "LIKERT", text: t, tags: ["MBTI:T"] }));
  F.forEach((t) => out.push({ category: "MBTI", type: "LIKERT", text: t, tags: ["MBTI:F"] }));
  J.forEach((t) => out.push({ category: "MBTI", type: "LIKERT", text: t, tags: ["MBTI:J"] }));
  P.forEach((t) => out.push({ category: "MBTI", type: "LIKERT", text: t, tags: ["MBTI:P"] }));
  return out;
}

// ============================================================
// EXPORT — global question bank
// ============================================================
export function buildSeedQuestions(): SeedQuestion[] {
  return [
    ...SALES_STYLE,
    ...COMMUNICATION,
    ...PERSONALITY,
    ...MOTIVATION,
    ...RESILIENCE,
    ...LEADERSHIP,
    ...DIRECTOR_MONTHLY_REVIEW,
    ...discQuestions(),
    ...enneagramQuestions(),
    ...mbtiQuestions(),
  ];
}

// Counts (for logging)
export const QUESTION_COUNTS = {
  SALES_STYLE: SALES_STYLE.length,
  COMMUNICATION: COMMUNICATION.length,
  PERSONALITY: PERSONALITY.length,
  MOTIVATION: MOTIVATION.length,
  RESILIENCE: RESILIENCE.length,
  LEADERSHIP: LEADERSHIP.length,
  DIRECTOR_MONTHLY_REVIEW: DIRECTOR_MONTHLY_REVIEW.length,
  DISC: 40,
  ENNEAGRAM: 90,
  MBTI: 80,  // 10 per side × 8 sides
};
