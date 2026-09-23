/**
 * Demo personas seed (v3.29) — 10 AEs + 5 directors, split across two customer orgs.
 *
 * All login with `changeme`.
 *
 * Hierarchy:
 *
 *   EUNA SOLUTIONS INC.
 *     VP Mike Reeves
 *     ├── Director Alex Director (existing) → 2 AEs (Cody, Maya)
 *     ├── Director Tasha Williams           → 2 AEs (Daniel, Esther)
 *     └── Director Marcus Chen              → 2 AEs (Riley, Sienna)
 *
 *   MINISTRY BRANDS
 *     VP Reggie Banks
 *     ├── Director Priya Patel              → 2 AEs (Trent, Naomi)
 *     └── Director Jordan Reyes             → 2 AEs (Brooks, Hana)
 *
 * No personas exist under the Ben Johnson AI platform org.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generateAnswersForPersona, generateDirectorAnswers, type PersonaContract, type MinimalQuestion } from "./seed-answers";

type OrgKey = "euna" | "ministry";

interface DirectorPersona {
  email: string;
  name: string;
  orgKey: OrgKey;
  // synthesized
  personalitySummary: string;
  leadershipSummary: string;
  forecastingSummary: string;
  motivations: string[];
  strengths: string[];
  weaknesses: string[];
  enneagramType: string;
  discProfile: string;
  mbtiType: string;
  // skill scores (LEADERSHIP, FORECASTING, COMMUNICATION, RESILIENCE)
  scores: { LEADERSHIP: number; FORECASTING: number; COMMUNICATION: number; RESILIENCE: number };
}

interface AePersona {
  email: string;
  name: string;
  directorEmail: string;        // which director they report to
  orgKey: OrgKey;
  // synthesized
  personalitySummary: string;
  salesStyleSummary: string;
  communicationSummary: string;
  motivations: string[];
  strengths: string[];
  weaknesses: string[];
  enneagramType: string;
  discProfile: string;
  mbtiType: string;
  // skill scores: 6 categories
  scores: {
    DISCOVERY: number;
    OBJECTION_HANDLING: number;
    CLOSING: number;
    COMMUNICATION: number;
    RESILIENCE: number;
    PRODUCT_MASTERY: number;
  };
  // notes added to the synthesized profile
  notes: string;
}

const DIRECTORS: DirectorPersona[] = [
  {
    email: "tasha@eunasolutions.example.com",
    name: "Tasha Williams",
    orgKey: "euna",
    personalitySummary: "Tasha is a high-D / Type-3 Achiever leader. Drives hard, sets aggressive targets, expects accountability. Holds herself to a higher standard than she holds her team.",
    leadershipSummary: "Coaches by question, but moves to direct command under pressure. Best with self-starters who need air cover, less effective with reps who need slower, structured development.",
    forecastingSummary: "Aggressive on Most Likely; conservative on Commit. Tends to over-call early in the quarter and right-size by week 8.",
    motivations: ["Recognition", "Building winning teams", "Being the top-performing director"],
    strengths: ["Decisive", "Commercial instinct", "Direct feedback", "Drives accountability"],
    weaknesses: ["Impatient with slow developers", "Sometimes skips empathy step", "Can over-pressure mid-tier reps"],
    enneagramType: "3",
    discProfile: "D",
    mbtiType: "ENTJ",
    scores: { LEADERSHIP: 78, FORECASTING: 72, COMMUNICATION: 70, RESILIENCE: 82 },
  },
  {
    email: "marcus@eunasolutions.example.com",
    name: "Marcus Chen",
    orgKey: "euna",
    personalitySummary: "Marcus is a high-C / Type-5 Investigator. Methodical, data-driven, deeply analytical. Preference for written specs over verbal. Prefers depth of one rep's territory over breadth.",
    leadershipSummary: "Coaches with frameworks (MEDDPICC, value selling). Strong with analytically-minded reps; less effective with high-energy I-types who need verbal momentum.",
    forecastingSummary: "Conservative across all categories. Forecast accuracy is excellent — typically within 3% of plan. Sometimes too conservative, leaving upside on the table.",
    motivations: ["Mastery", "Building durable systems", "Predictability"],
    strengths: ["Analytical rigor", "Systems thinking", "Forecast discipline", "Process design"],
    weaknesses: ["Slow to make people calls", "Avoids confrontation", "Under-celebrates wins"],
    enneagramType: "5",
    discProfile: "C",
    mbtiType: "INTJ",
    scores: { LEADERSHIP: 65, FORECASTING: 88, COMMUNICATION: 58, RESILIENCE: 70 },
  },
  {
    email: "priya@ministrybrands.example.com",
    name: "Priya Patel",
    orgKey: "ministry",
    personalitySummary: "Priya is a high-I / Type-2 Helper. Magnetic personality, builds deep loyalty with her team, reads the room expertly. Loves coaching, less drawn to hard accountability conversations.",
    leadershipSummary: "Best-in-class at developing emerging reps and rebuilding morale. Coaches through relationship and example. Struggles to deliver hard exit conversations on time.",
    forecastingSummary: "Optimistic forecaster; inflated Best Case. Coverage looks great on paper but Commits sometimes slip. Coachable to tighten rigor.",
    motivations: ["Team success", "Developing people", "Being needed"],
    strengths: ["Relationship building", "Team morale", "Developing junior reps", "Communication"],
    weaknesses: ["Over-optimistic forecast", "Avoids hard people calls", "Takes on too much herself"],
    enneagramType: "2",
    discProfile: "I",
    mbtiType: "ENFJ",
    scores: { LEADERSHIP: 80, FORECASTING: 55, COMMUNICATION: 90, RESILIENCE: 68 },
  },
  {
    email: "jordan@ministrybrands.example.com",
    name: "Jordan Reyes",
    orgKey: "ministry",
    personalitySummary: "Jordan is a high-S / Type-9 Peacemaker. Steady, calm, even-keeled. Reads conflict early and defuses well. Has a long-term horizon and patient with development.",
    leadershipSummary: "Coaches with patience and incremental challenge. Strong with reps in slumps. Sometimes too patient — slow to part ways with reps who can't make it.",
    forecastingSummary: "Middle-of-the-road forecaster. Slight tendency to under-call Most Likely to avoid disappointment. Reliable and predictable.",
    motivations: ["Stability", "Long-term team health", "Helping reps grow"],
    strengths: ["Calm under pressure", "Long-term thinking", "Patient coaching", "Deep relationships"],
    weaknesses: ["Slow on tough decisions", "Under-calls Most Likely", "Avoids stretching reps"],
    enneagramType: "9",
    discProfile: "S",
    mbtiType: "ISFJ",
    scores: { LEADERSHIP: 70, FORECASTING: 68, COMMUNICATION: 75, RESILIENCE: 78 },
  },
];

// Existing director Alex Director — also synthesize a profile for them (Euna)
const ALEX_DIRECTOR: Omit<DirectorPersona, "email" | "name" | "orgKey"> = {
  personalitySummary: "Alex is a balanced, measured leader. Slight C/Type-1 lean — values quality and integrity over speed. Direct communicator, fair, and consistent.",
  leadershipSummary: "Coaches with structured frameworks and follows up consistently. Holds reps accountable without crushing them. Best with mid-tier reps who need both rigor and air cover.",
  forecastingSummary: "Disciplined forecaster. Commit accuracy 92%+. Most Likely tends slightly conservative; Best Case is well-disciplined.",
  motivations: ["Doing things right", "Developing reps", "Sustained team performance"],
  strengths: ["Forecast discipline", "Consistent coaching cadence", "Fairness", "Team morale"],
  weaknesses: ["Sometimes too process-heavy", "Slow on rapid territory shifts", "Under-celebrates"],
  enneagramType: "1",
  discProfile: "DC",
  mbtiType: "ISTJ",
  scores: { LEADERSHIP: 78, FORECASTING: 85, COMMUNICATION: 76, RESILIENCE: 80 },
};

// 10 AEs — diverse personalities, skill ranges, split between Euna and Ministry
const AES: AePersona[] = [
  // ---- Euna AEs (under Alex / Tasha / Marcus) ----
  {
    email: "ae-d-driver@eunasolutions.example.com",
    name: "Cody Reeves",
    directorEmail: "alex@eunasolutions.example.com",
    orgKey: "euna",
    personalitySummary: "Cody is a high-D / Type-8 Challenger. Hard-charging closer who runs his territory like a battlefield. Direct, blunt, doesn't hide his opinion. Energized by hard problems and pushback.",
    salesStyleSummary: "Aggressive prospector. Skips rapport, drives to outcomes fast. Sets shot-clock deadlines. High close rate on qualified deals; tends to lose softer deals to relationship-builders.",
    communicationSummary: "Punchy, blunt, never softens. Effective with senior buyers; can rub mid-management the wrong way.",
    motivations: ["Money", "Recognition", "Beating the leaderboard"],
    strengths: ["Closing", "Negotiating", "Activity volume", "Resilience under pressure"],
    weaknesses: ["Discovery depth", "Patience with longer sales cycles", "Listening before talking"],
    enneagramType: "8",
    discProfile: "D",
    mbtiType: "ESTJ",
    scores: { DISCOVERY: 55, OBJECTION_HANDLING: 78, CLOSING: 86, COMMUNICATION: 60, RESILIENCE: 88, PRODUCT_MASTERY: 65 },
    notes: "Coach: tighten discovery — Cody loses 30% of his pipeline to weak qualification.",
  },
  {
    email: "ae-i-charmer@eunasolutions.example.com",
    name: "Maya Lindgren",
    directorEmail: "alex@eunasolutions.example.com",
    orgKey: "euna",
    personalitySummary: "Maya is a high-I / Type-7 Enthusiast. Magnetic in person, infectious energy, loves new opportunities. Builds rapport in 90 seconds.",
    salesStyleSummary: "Top-of-funnel monster. Books more meetings than anyone. Loses momentum mid-cycle when she has to push detail or process. Best on net-new logos, weaker on expansion.",
    communicationSummary: "Story-driven, energetic, persuasive in real time. Email follow-ups are inconsistent.",
    motivations: ["Variety", "Recognition", "Meeting interesting people"],
    strengths: ["Discovery (broad)", "Rapport", "New logo prospecting", "Energy in calls"],
    weaknesses: ["Follow-through on details", "MEDDPICC discipline", "Forecast accuracy", "Closing momentum on long deals"],
    enneagramType: "7",
    discProfile: "I",
    mbtiType: "ENFP",
    scores: { DISCOVERY: 72, OBJECTION_HANDLING: 65, CLOSING: 58, COMMUNICATION: 84, RESILIENCE: 70, PRODUCT_MASTERY: 55 },
    notes: "Coach: structure mid-cycle — Maya needs a written deal plan to convert energy into closes.",
  },
  {
    email: "ae-s-loyalist@eunasolutions.example.com",
    name: "Daniel Hargrove",
    directorEmail: "tasha@eunasolutions.example.com",
    orgKey: "euna",
    personalitySummary: "Daniel is a high-S / Type-6 Loyalist. Steady, dependable, methodical. Customers love him; renewals come in without drama.",
    salesStyleSummary: "Slow to qualify in, slow to qualify out. Long-term relationship player. Best on multi-year accounts and renewals; weaker on net-new.",
    communicationSummary: "Considerate, careful, never blunt. Sometimes under-asserts when he should push back.",
    motivations: ["Stability", "Loyalty", "Team success"],
    strengths: ["Account management", "Trust building", "Renewal execution", "Listening"],
    weaknesses: ["Closing momentum", "Asserting in tough negotiations", "Net-new prospecting"],
    enneagramType: "6",
    discProfile: "S",
    mbtiType: "ISFJ",
    scores: { DISCOVERY: 70, OBJECTION_HANDLING: 50, CLOSING: 48, COMMUNICATION: 72, RESILIENCE: 68, PRODUCT_MASTERY: 75 },
    notes: "Coach: closing momentum — Daniel lets deals drift past their natural close.",
  },
  {
    email: "ae-c-analyst@eunasolutions.example.com",
    name: "Esther Park",
    directorEmail: "tasha@eunasolutions.example.com",
    orgKey: "euna",
    personalitySummary: "Esther is a high-C / Type-5 Investigator. Deeply analytical, knows the product cold, prepares meticulously.",
    salesStyleSummary: "Best on technical deals. Wins via depth of expertise and credibility. Weaker on emotional buyers; sometimes over-shows the math.",
    communicationSummary: "Precise, written, well-organized. Quiet in group settings; powerful 1:1 with technical decision-makers.",
    motivations: ["Mastery", "Being right", "Solving complex problems"],
    strengths: ["Product mastery", "Technical discovery", "MEDDPICC discipline", "Forecast accuracy"],
    weaknesses: ["Emotional rapport", "Closing speed", "Comfort with ambiguity"],
    enneagramType: "5",
    discProfile: "C",
    mbtiType: "INTJ",
    scores: { DISCOVERY: 80, OBJECTION_HANDLING: 72, CLOSING: 60, COMMUNICATION: 62, RESILIENCE: 65, PRODUCT_MASTERY: 88 },
    notes: "Coach: emotional rapport — Esther wins logic, loses to AEs with stronger executive presence.",
  },
  {
    email: "ae-perfectionist@eunasolutions.example.com",
    name: "Riley Donovan",
    directorEmail: "marcus@eunasolutions.example.com",
    orgKey: "euna",
    personalitySummary: "Riley is a Type-1 Reformer with C/D blend. High standards, holds the bar — sometimes to a fault. Notices what's wrong before what's right.",
    salesStyleSummary: "Strong qualifier. Won't move a deal without confidence. Forecast accuracy is excellent. Sometimes over-qualifies and walks away from deals others would close.",
    communicationSummary: "Direct, fair, slightly stiff. Customers respect the integrity; some find it cold.",
    motivations: ["Doing it right", "Mastery", "Integrity"],
    strengths: ["Qualification rigor", "Forecast accuracy", "Honesty with customers", "Discipline"],
    weaknesses: ["Loosening up", "Risk-taking on borderline deals", "Celebrating wins"],
    enneagramType: "1",
    discProfile: "DC",
    mbtiType: "ISTJ",
    scores: { DISCOVERY: 78, OBJECTION_HANDLING: 70, CLOSING: 68, COMMUNICATION: 65, RESILIENCE: 72, PRODUCT_MASTERY: 78 },
    notes: "Coach: loosen qualification on borderline deals — Riley walks away from coachable deals.",
  },
  {
    email: "ae-helper@eunasolutions.example.com",
    name: "Sienna Ortiz",
    directorEmail: "marcus@eunasolutions.example.com",
    orgKey: "euna",
    personalitySummary: "Sienna is a Type-2 Helper with I lean. Reads customers' emotional state instantly, builds deep loyalty.",
    salesStyleSummary: "Excellent on multi-stakeholder deals. Customers ask for her by name. Sometimes gives away too much in negotiation; weak on price discipline.",
    communicationSummary: "Warm, attentive, listens twice as much as she talks. Sometimes too accommodating.",
    motivations: ["Helping customers", "Team", "Being needed"],
    strengths: ["Stakeholder mapping", "Empathy", "Closing on relationship strength", "Reading the room"],
    weaknesses: ["Pricing discipline", "Saying no", "Self-promotion"],
    enneagramType: "2",
    discProfile: "IS",
    mbtiType: "ESFJ",
    scores: { DISCOVERY: 76, OBJECTION_HANDLING: 68, CLOSING: 72, COMMUNICATION: 86, RESILIENCE: 64, PRODUCT_MASTERY: 70 },
    notes: "Coach: pricing discipline — Sienna's deals close at 12% below list on average.",
  },

  // ---- Ministry Brands AEs (under Priya / Jordan) ----
  {
    email: "ae-achiever@ministrybrands.example.com",
    name: "Trent Macready",
    directorEmail: "priya@ministrybrands.example.com",
    orgKey: "ministry",
    personalitySummary: "Trent is a Type-3 Achiever with D lean. Status-driven, performance-obsessed, adapts to whoever's in front of him.",
    salesStyleSummary: "Top of leaderboard most quarters. Charges hard, optimizes for visible wins. Less rigorous on accounts that don't show up on the scoreboard.",
    communicationSummary: "Polished, confident, executive-presence. Adapts style to the audience.",
    motivations: ["Recognition", "Money", "Being #1"],
    strengths: ["Closing", "Executive presence", "Adaptability", "Self-promotion"],
    weaknesses: ["Long-tail account development", "Authenticity under stress", "Sustaining unflashy work"],
    enneagramType: "3",
    discProfile: "D",
    mbtiType: "ESTP",
    scores: { DISCOVERY: 70, OBJECTION_HANDLING: 78, CLOSING: 88, COMMUNICATION: 82, RESILIENCE: 75, PRODUCT_MASTERY: 68 },
    notes: "Coach: under-the-radar accounts — Trent's leaderboard accounts are gold; his B-tier accounts go neglected.",
  },
  {
    email: "ae-individualist@ministrybrands.example.com",
    name: "Naomi Vance",
    directorEmail: "priya@ministrybrands.example.com",
    orgKey: "ministry",
    personalitySummary: "Naomi is a Type-4 Individualist with N lean. Thoughtful, creative, draws emotional truth out of customers.",
    salesStyleSummary: "Wins unique deals others wouldn't see. Strong with values-driven buyers (mission-driven orgs, founders). Inconsistent on volume; some quarters big, some quarters quiet.",
    communicationSummary: "Distinctive voice. Memorable. Sometimes too unusual for conservative buyers.",
    motivations: ["Authenticity", "Meaningful work", "Being uniquely seen"],
    strengths: ["Differentiated positioning", "Storytelling", "Emotional intelligence", "Champion-building"],
    weaknesses: ["Consistency of activity", "Volume discipline", "Standardized playbooks"],
    enneagramType: "4",
    discProfile: "I",
    mbtiType: "INFP",
    scores: { DISCOVERY: 74, OBJECTION_HANDLING: 60, CLOSING: 66, COMMUNICATION: 78, RESILIENCE: 58, PRODUCT_MASTERY: 60 },
    notes: "Coach: activity consistency — Naomi's pipeline rises and falls with her mood.",
  },
  {
    email: "ae-loyalist-new@ministrybrands.example.com",
    name: "Brooks Tanaka",
    directorEmail: "jordan@ministrybrands.example.com",
    orgKey: "ministry",
    personalitySummary: "Brooks is a Type-6 Loyalist with high preparation instincts. Researches everything; over-prepares for every call.",
    salesStyleSummary: "Strong on technical and process-heavy buyers (procurement, compliance). Slow ramp; once trained on a vertical, very dependable.",
    communicationSummary: "Detailed, prepared, prefers written follow-up. Quiet in unstructured situations.",
    motivations: ["Security", "Loyalty", "Mastery"],
    strengths: ["Preparation", "Risk identification", "Process discipline", "Compliance-heavy verticals"],
    weaknesses: ["Improvising under pressure", "Bold asks", "Confidence on cold opens"],
    enneagramType: "6",
    discProfile: "CS",
    mbtiType: "ISTJ",
    scores: { DISCOVERY: 68, OBJECTION_HANDLING: 58, CLOSING: 50, COMMUNICATION: 65, RESILIENCE: 60, PRODUCT_MASTERY: 78 },
    notes: "Coach: confidence on cold opens — Brooks freezes on unstructured calls.",
  },
  {
    email: "ae-peacemaker@ministrybrands.example.com",
    name: "Hana Solberg",
    directorEmail: "jordan@ministrybrands.example.com",
    orgKey: "ministry",
    personalitySummary: "Hana is a Type-9 Peacemaker. Calm, harmonious, reads conflict early and defuses. Customers say she's the easiest AE to work with.",
    salesStyleSummary: "Strong on consensus-buying motions. Wins deals where multiple stakeholders need to agree. Weaker on aggressive negotiations; sometimes lets the customer drive.",
    communicationSummary: "Even-keeled, attentive, never confrontational. Pace is steady and unhurried.",
    motivations: ["Harmony", "Long-term relationships", "Stability"],
    strengths: ["Consensus building", "Multi-stakeholder navigation", "Customer satisfaction", "Patience"],
    weaknesses: ["Asserting in negotiations", "Closing urgency", "Pushing back on price"],
    enneagramType: "9",
    discProfile: "S",
    mbtiType: "INFJ",
    scores: { DISCOVERY: 72, OBJECTION_HANDLING: 55, CLOSING: 52, COMMUNICATION: 80, RESILIENCE: 70, PRODUCT_MASTERY: 72 },
    notes: "Coach: closing urgency — Hana's deals push by an average of 2 weeks per stage.",
  },
];

export interface SeedPersonasOpts {
  eunaOrgId: string;
  ministryOrgId: string;
  eunaVpId: string;
  ministryVpId: string;
  existingDirectorEmail: string;
}

/**
 * Canonical email → orgKey map for every seeded persona, used by the seed's
 * enforcement pass to detect (and fix) any persona that has drifted into a
 * non-canonical org from an older seed iteration.
 *
 * Includes the platform-side super admin and the existing-Alex director, plus
 * every COMPANY_ADMIN, VP, director, and AE we create.
 */
export function getCanonicalPersonaEmailMap(): Record<string, OrgKey> {
  const map: Record<string, OrgKey> = {
    // Euna leadership
    "sarah@eunasolutions.example.com":   "euna",
    "mike@eunasolutions.example.com":    "euna",
    "alex@eunasolutions.example.com":    "euna",
    "ae-demo@eunasolutions.example.com": "euna",
    // Ministry leadership
    "diane@ministrybrands.example.com":  "ministry",
    "reggie@ministrybrands.example.com": "ministry",
  };
  for (const d of DIRECTORS) map[d.email] = d.orgKey;
  for (const a of AES)       map[a.email] = a.orgKey;
  return map;
}

export async function seedPersonas(prisma: PrismaClient, opts: SeedPersonasOpts) {
  const passwordHash = await bcrypt.hash("changeme", 12);

  const orgIdFor = (key: OrgKey) => key === "euna" ? opts.eunaOrgId : opts.ministryOrgId;
  const vpIdFor  = (key: OrgKey) => key === "euna" ? opts.eunaVpId  : opts.ministryVpId;

  // Pre-load global questions once — used to synthesize Answer rows for every persona
  const allQuestions: MinimalQuestion[] = (await prisma.question.findMany({
    where: { orgId: null, active: true },
    select: { id: true, category: true, questionType: true, text: true, optionsJson: true, tagsJson: true },
  })) as any;

  let totalAnswersCreated = 0;

  async function persistCompletedAnswerSet(
    target: { aeProfileId?: string; directorProfileId?: string },
    answers: Array<{ questionId: string; value: any }>,
  ) {
    if (answers.length === 0) return;

    // Wipe any prior answer sets for this profile so re-running seed doesn't accumulate
    if (target.aeProfileId) {
      await prisma.answer.deleteMany({ where: { answerSet: { aeProfileId: target.aeProfileId } } });
      await prisma.answerSet.deleteMany({ where: { aeProfileId: target.aeProfileId } });
    } else if (target.directorProfileId) {
      await prisma.answer.deleteMany({ where: { answerSet: { directorProfileId: target.directorProfileId } } });
      await prisma.answerSet.deleteMany({ where: { directorProfileId: target.directorProfileId } });
    }

    const set = await prisma.answerSet.create({
      data: {
        aeProfileId: target.aeProfileId,
        directorProfileId: target.directorProfileId,
        version: 1,
        status: "COMPLETED",
        questionOrder: answers.map((a) => a.questionId) as any,
        resumeIndex: answers.length,
        startedAt: new Date(Date.now() - 14 * 24 * 3600 * 1000),
        completedAt: new Date(Date.now() - 13 * 24 * 3600 * 1000),
      },
    });
    // Bulk insert answers
    for (const a of answers) {
      await prisma.answer.create({
        data: { answerSetId: set.id, questionId: a.questionId, value: a.value as any },
      });
    }
    totalAnswersCreated += answers.length;
  }

  // ---- Existing Alex Director (Euna) — backfill DirectorProfile + scores + answers ----
  const alexUser = await prisma.user.findUnique({ where: { email: opts.existingDirectorEmail } });
  if (alexUser) {
    const alexProfile = await prisma.directorProfile.upsert({
      where: { userId: alexUser.id },
      update: {
        personalitySummary: ALEX_DIRECTOR.personalitySummary,
        leadershipSummary: ALEX_DIRECTOR.leadershipSummary,
        forecastingSummary: ALEX_DIRECTOR.forecastingSummary,
        motivations: ALEX_DIRECTOR.motivations as any,
        strengthsJson: ALEX_DIRECTOR.strengths as any,
        weaknessesJson: ALEX_DIRECTOR.weaknesses as any,
        enneagramType: ALEX_DIRECTOR.enneagramType,
        discProfile: ALEX_DIRECTOR.discProfile,
        mbtiType: ALEX_DIRECTOR.mbtiType,
        lastSynthesizedAt: new Date(),
      },
      create: {
        userId: alexUser.id,
        orgId: opts.eunaOrgId,
        personalitySummary: ALEX_DIRECTOR.personalitySummary,
        leadershipSummary: ALEX_DIRECTOR.leadershipSummary,
        forecastingSummary: ALEX_DIRECTOR.forecastingSummary,
        motivations: ALEX_DIRECTOR.motivations as any,
        strengthsJson: ALEX_DIRECTOR.strengths as any,
        weaknessesJson: ALEX_DIRECTOR.weaknesses as any,
        enneagramType: ALEX_DIRECTOR.enneagramType,
        discProfile: ALEX_DIRECTOR.discProfile,
        mbtiType: ALEX_DIRECTOR.mbtiType,
        lastSynthesizedAt: new Date(),
      },
    });
    for (const [cat, score] of Object.entries(ALEX_DIRECTOR.scores)) {
      await prisma.directorSkillScore.upsert({
        where: { directorProfileId_category: { directorProfileId: alexProfile.id, category: cat as any } },
        update: { score, level: Math.max(1, Math.ceil(score / 20)), source: "AI" },
        create: { directorProfileId: alexProfile.id, category: cat as any, score, level: Math.max(1, Math.ceil(score / 20)), source: "AI" },
      });
    }
    // Generate answers
    const alexPersona: PersonaContract = {
      name: alexUser.name,
      enneagramType: ALEX_DIRECTOR.enneagramType,
      discProfile: ALEX_DIRECTOR.discProfile,
      mbtiType: ALEX_DIRECTOR.mbtiType,
      scores: ALEX_DIRECTOR.scores as any,
    };
    const alexAnswers = generateDirectorAnswers(alexPersona, allQuestions);
    await persistCompletedAnswerSet({ directorProfileId: alexProfile.id }, alexAnswers);
  }

  // ---- Create 4 new directors (2 Euna + 2 Ministry) ----
  const directorIdByEmail: Record<string, string> = {};
  if (alexUser) directorIdByEmail[alexUser.email] = alexUser.id;

  for (const d of DIRECTORS) {
    const orgId = orgIdFor(d.orgKey);
    const vpId  = vpIdFor(d.orgKey);

    const dirUser = await prisma.user.upsert({
      where: { email: d.email },
      update: { role: "DIRECTOR", vpId, orgId },
      create: {
        email: d.email,
        name: d.name,
        role: "DIRECTOR",
        orgId,
        vpId,
        passwordHash,
        passwordSetAt: new Date(),
        status: "ACTIVE",
      },
    });
    directorIdByEmail[d.email] = dirUser.id;

    const dp = await prisma.directorProfile.upsert({
      where: { userId: dirUser.id },
      update: {
        personalitySummary: d.personalitySummary,
        leadershipSummary: d.leadershipSummary,
        forecastingSummary: d.forecastingSummary,
        motivations: d.motivations as any,
        strengthsJson: d.strengths as any,
        weaknessesJson: d.weaknesses as any,
        enneagramType: d.enneagramType,
        discProfile: d.discProfile,
        mbtiType: d.mbtiType,
        lastSynthesizedAt: new Date(),
      },
      create: {
        userId: dirUser.id,
        orgId,
        personalitySummary: d.personalitySummary,
        leadershipSummary: d.leadershipSummary,
        forecastingSummary: d.forecastingSummary,
        motivations: d.motivations as any,
        strengthsJson: d.strengths as any,
        weaknessesJson: d.weaknesses as any,
        enneagramType: d.enneagramType,
        discProfile: d.discProfile,
        mbtiType: d.mbtiType,
        lastSynthesizedAt: new Date(),
      },
    });

    for (const [cat, score] of Object.entries(d.scores)) {
      await prisma.directorSkillScore.upsert({
        where: { directorProfileId_category: { directorProfileId: dp.id, category: cat as any } },
        update: { score, level: Math.max(1, Math.ceil(score / 20)), source: "AI" },
        create: { directorProfileId: dp.id, category: cat as any, score, level: Math.max(1, Math.ceil(score / 20)), source: "AI" },
      });
    }

    // Generate full intake answers
    const dirAnswers = generateDirectorAnswers(
      { name: d.name, enneagramType: d.enneagramType, discProfile: d.discProfile, mbtiType: d.mbtiType, scores: d.scores as any },
      allQuestions,
    );
    await persistCompletedAnswerSet({ directorProfileId: dp.id }, dirAnswers);
  }

  // ---- Create 10 AEs ----
  for (const a of AES) {
    const directorId = directorIdByEmail[a.directorEmail];
    if (!directorId) {
      console.warn(`Skipping AE ${a.name} — director ${a.directorEmail} not found`);
      continue;
    }
    const orgId = orgIdFor(a.orgKey);

    const aeUser = await prisma.user.upsert({
      where: { email: a.email },
      update: { role: "AE", orgId },
      create: {
        email: a.email,
        name: a.name,
        role: "AE",
        orgId,
        passwordHash,
        passwordSetAt: new Date(),
        status: "ACTIVE",
      },
    });

    const aeProfile = await prisma.aeProfile.upsert({
      where: { userId: aeUser.id },
      update: {
        directorId,
        orgId,
        personalitySummary: a.personalitySummary,
        salesStyleSummary: a.salesStyleSummary,
        communicationSummary: a.communicationSummary,
        motivations: a.motivations as any,
        strengthsJson: a.strengths as any,
        weaknessesJson: a.weaknesses as any,
        enneagramType: a.enneagramType,
        discProfile: a.discProfile,
        mbtiType: a.mbtiType,
        lastSynthesizedAt: new Date(),
        bioShort: a.notes,
      },
      create: {
        userId: aeUser.id,
        orgId,
        directorId,
        personalitySummary: a.personalitySummary,
        salesStyleSummary: a.salesStyleSummary,
        communicationSummary: a.communicationSummary,
        motivations: a.motivations as any,
        strengthsJson: a.strengths as any,
        weaknessesJson: a.weaknesses as any,
        enneagramType: a.enneagramType,
        discProfile: a.discProfile,
        mbtiType: a.mbtiType,
        lastSynthesizedAt: new Date(),
        bioShort: a.notes,
      },
    });

    // Skill scores
    for (const [cat, score] of Object.entries(a.scores)) {
      await prisma.skillScore.upsert({
        where: { aeProfileId_category: { aeProfileId: aeProfile.id, category: cat as any } },
        update: { score, level: Math.max(1, Math.ceil(score / 20)), source: "AI" },
        create: { aeProfileId: aeProfile.id, category: cat as any, score, level: Math.max(1, Math.ceil(score / 20)), source: "AI" },
      });
    }

    // Generate full intake answers — every persona gets ~70+ real answers
    // tagged to their personality + skill profile so the reasoning drawers
    // and skill synthesis have actual receipts to point at.
    const aeAnswers = generateAnswersForPersona(
      {
        name: a.name,
        bioShort: a.notes,
        enneagramType: a.enneagramType,
        discProfile: a.discProfile,
        mbtiType: a.mbtiType,
        scores: a.scores as any,
      },
      allQuestions,
    );
    await persistCompletedAnswerSet({ aeProfileId: aeProfile.id }, aeAnswers);
  }

  console.log(`  Persisted ${totalAnswersCreated} intake answer rows across all personas.`);

  return { directorCount: DIRECTORS.length, aeCount: AES.length };
}
