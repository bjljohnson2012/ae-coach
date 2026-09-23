/**
 * GET /api/users/[id]/profile-detail?field=strengths|weaknesses|personality|salesStyle|communication|motivations
 *
 * Returns the requested field's prose/list + the supporting evidence:
 *   - Synthesized text or list (existing summary)
 *   - Friendly-rendered answers with per-answer impact rationale
 *   - Broader signals (always populated — never empty)
 *   - Score history relevant to the field
 *   - Director review excerpts
 *   - 1:1 prep mentions
 *   - Coaching hints (leader-only)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenancy";
import { generateCoachingHints, type CoachingHintsOutput } from "@/lib/ai";
import { getLatestInputSignalAt, isStale } from "@/lib/profileSignals";

const FIELD_TO_TAGS: Record<string, string[]> = {
  personality:    ["DISC:", "MBTI:", "ENNEAGRAM:", "PERSONALITY"],
  salesstyle:     ["DISCOVERY", "OBJECTION_HANDLING", "CLOSING", "SALES_STYLE"],
  sales_style:    ["DISCOVERY", "OBJECTION_HANDLING", "CLOSING", "SALES_STYLE"],
  communication:  ["COMMUNICATION", "DISC:I", "DISC:S", "MBTI:E", "MBTI:I"],
  motivations:    ["MOTIVATION"],
  strengths:      [],
  weaknesses:     [],
};

const VALID_SKILL_CATEGORIES = new Set([
  "DISCOVERY", "OBJECTION_HANDLING", "CLOSING",
  "COMMUNICATION", "RESILIENCE", "PRODUCT_MASTERY",
  "LEADERSHIP", "FORECASTING",
]);

const LEADER_ROLES = new Set(["ORG_ADMIN", "COMPANY_ADMIN", "VP_SALES", "DIRECTOR"]);

const LIKERT_LABELS: Record<number, string> = {
  1: "Strongly disagree",
  2: "Disagree",
  3: "Neutral",
  4: "Agree",
  5: "Strongly agree",
};

function tagMatches(tag: string, prefixes: string[]): boolean {
  if (prefixes.length === 0) return false;
  const upper = tag.toUpperCase();
  return prefixes.some((p) => upper.startsWith(p));
}

/** Friendly label + numeric value for any answer shape. */
function renderAnswer(value: any, type: string, options: any): { label: string; numeric: number | null } {
  if (value === null || value === undefined) return { label: "—", numeric: null };

  if (type === "MULTIPLE_CHOICE" && Array.isArray(options)) {
    const v = (value && typeof value === "object" ? value.value : value);
    const opt = options.find((o: any) => o.value === v);
    if (opt) return { label: `"${opt.label}"`, numeric: null };
    return { label: String(v), numeric: null };
  }

  if (type === "LIKERT") {
    const n = typeof value === "object" ? (value?.value ?? value?.score) : value;
    const num = typeof n === "number" ? n : Number(n);
    if (!isNaN(num)) {
      return { label: `${LIKERT_LABELS[num] ?? num} (${num}/5)`, numeric: num };
    }
  }

  if (type === "SLIDER") {
    const n = typeof value === "object" ? (value?.value ?? value?.score) : value;
    const num = typeof n === "number" ? n : Number(n);
    if (!isNaN(num)) return { label: `${num}/100`, numeric: num };
  }

  if (typeof value === "string") {
    return { label: value.length > 280 ? value.slice(0, 280) + "…" : value, numeric: null };
  }
  return { label: JSON.stringify(value).slice(0, 200), numeric: null };
}

/** Short rationale describing what this answer says about the requested field. */
function describeImpact(args: {
  matchedTags: string[];
  answerType: string;
  numeric: number | null;
  optionTags?: string[];
  fieldKey: string;
}): string {
  const { matchedTags, answerType, numeric, optionTags = [], fieldKey } = args;
  const tags = Array.from(new Set([...matchedTags, ...optionTags.filter((t) => matchedTags.some((m) => t.toUpperCase().startsWith(m.split(":")[0])))]));

  // For LIKERT, the strength of agreement determines the signal direction
  if (answerType === "LIKERT" && numeric !== null) {
    if (numeric >= 4) {
      return `Confirms ${formatTags(tags)} — agreed strongly.`;
    } else if (numeric <= 2) {
      return `Pushes against ${formatTags(tags)} — disagreed.`;
    }
    return `Mixed signal on ${formatTags(tags)} — neutral response.`;
  }

  if (answerType === "MULTIPLE_CHOICE") {
    const positive = optionTags.filter((t) => t.includes("+")).map((t) => t.replace(/[+-]\d+/, "").trim());
    const negative = optionTags.filter((t) => t.includes("-") && /:.*-\d+/.test(t)).map((t) => t.replace(/[+-]\d+/, "").trim());
    if (positive.length > 0) return `Selected option scores ${formatTags(positive)} positively.`;
    if (negative.length > 0) return `Selected option scores ${formatTags(negative)} negatively.`;
    if (tags.length > 0) return `Choice aligns with ${formatTags(tags)}.`;
    return `Choice contributed to this field's synthesis.`;
  }

  if (answerType === "LONG_FORM") {
    return `Free-text response shaped the ${prettyField(fieldKey)} narrative directly.`;
  }

  if (tags.length > 0) return `Matched ${formatTags(tags)}.`;
  return `Contributed to the ${prettyField(fieldKey)} synthesis.`;
}

function formatTags(tags: string[]): string {
  if (tags.length === 0) return "this dimension";
  if (tags.length === 1) return tags[0];
  if (tags.length === 2) return `${tags[0]} + ${tags[1]}`;
  return `${tags[0]}, ${tags[1]}, +${tags.length - 2} more`;
}

function prettyField(field: string): string {
  switch (field) {
    case "salesstyle": case "sales_style": return "sales style";
    case "personality": return "personality";
    case "communication": return "communication style";
    case "motivations": return "motivations";
    case "strengths": return "strengths";
    case "weaknesses": return "growth areas";
  }
  return field;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    return await handleGet(req, params);
  } catch (e: any) {
    console.error("[profile-detail] handler crashed:", e);
    return NextResponse.json({ error: `Profile detail failed: ${e?.message ?? "unknown"}` }, { status: 500 });
  }
}

async function handleGet(req: Request, params: { id: string }) {
  const ctx = await requireSession();

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, email: true, role: true, orgId: true, imageUrl: true },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ctx.role !== "ORG_ADMIN" && target.orgId !== ctx.effectiveOrgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const field = (url.searchParams.get("field") ?? "personality").toLowerCase();
  const tagPrefixes = FIELD_TO_TAGS[field] ?? [];

  const [aeProfile, directorProfile] = await Promise.all([
    prisma.aeProfile.findUnique({
      where: { userId: target.id },
      include: { skillScores: true, coachingNotes: { orderBy: { createdAt: "desc" }, take: 5, include: { director: { select: { name: true } } } } },
    }),
    prisma.directorProfile.findUnique({
      where: { userId: target.id },
      include: { skillScores: true },
    }),
  ]);

  const profile = aeProfile ?? directorProfile;
  if (!profile) {
    return NextResponse.json({
      target,
      field,
      empty: true,
      reason: "No synthesized profile yet — they may not have completed intake.",
    });
  }

  // ----- Primary content -----
  let primaryText: string | null = null;
  let primaryList: string[] = [];
  let label = "";
  switch (field) {
    case "personality":
      primaryText = profile.personalitySummary;
      label = "Personality";
      break;
    case "salesstyle":
    case "sales_style":
      primaryText = (aeProfile as any)?.salesStyleSummary ?? (directorProfile as any)?.leadershipSummary ?? null;
      label = aeProfile ? "Sales style" : "Leadership style";
      break;
    case "communication":
      primaryText = (aeProfile as any)?.communicationSummary ?? (directorProfile as any)?.forecastingSummary ?? null;
      label = aeProfile ? "Communication style" : "Forecasting style";
      break;
    case "motivations":
      primaryList = (profile.motivations as string[]) ?? [];
      label = "Motivations";
      break;
    case "strengths":
      primaryList = (profile.strengthsJson as string[]) ?? [];
      label = "Strengths";
      break;
    case "weaknesses":
      primaryList = (profile.weaknessesJson as string[]) ?? [];
      label = "Growth areas";
      break;
    default:
      return NextResponse.json({ error: `Unknown field: ${field}` }, { status: 400 });
  }

  // ----- Supporting answers (with friendly rendering + impact) -----
  type Supporting = {
    questionText: string;
    questionType: string;
    answerLabel: string;
    impact: string;
    matchedTags: string[];
  };
  let supportingAnswers: Supporting[] = [];
  let answerSetCompletedAt: Date | null = null;

  const latestSet = await prisma.answerSet.findFirst({
    where: aeProfile ? { aeProfileId: aeProfile.id, status: "COMPLETED" } : { directorProfileId: directorProfile!.id, status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    include: {
      answers: { include: { question: { select: { text: true, questionType: true, optionsJson: true, tagsJson: true } } } },
    },
  });

  if (latestSet) {
    answerSetCompletedAt = latestSet.completedAt;
    for (const ans of latestSet.answers) {
      const qTags = (ans.question.tagsJson as string[]) ?? [];
      const opts = ans.question.optionsJson as any[] | null;
      const matched: string[] = [];
      for (const t of qTags) if (tagMatches(t, tagPrefixes)) matched.push(t);
      let optionTags: string[] = [];
      if (ans.question.questionType === "MULTIPLE_CHOICE" && Array.isArray(opts)) {
        const v = (ans.value as any)?.value ?? ans.value;
        const chosen = opts.find((o: any) => o?.value === v);
        if (chosen && Array.isArray(chosen.tags)) {
          optionTags = chosen.tags;
          for (const t of chosen.tags) if (tagMatches(t, tagPrefixes)) matched.push(t);
        }
      }
      if (matched.length > 0) {
        const rendered = renderAnswer(ans.value, ans.question.questionType, opts);
        supportingAnswers.push({
          questionText: ans.question.text,
          questionType: ans.question.questionType,
          answerLabel: rendered.label,
          impact: describeImpact({
            matchedTags: matched,
            answerType: ans.question.questionType,
            numeric: rendered.numeric,
            optionTags,
            fieldKey: field,
          }),
          matchedTags: matched,
        });
      }
    }
  }

  // ----- Broader signals (ALWAYS populated — even if no tagged answers) -----
  const broaderSignals: Array<{ label: string; signal: string; tone?: "neutral" | "positive" | "watch" }> = [];

  // Personality stack
  if (profile.enneagramType || profile.discProfile || profile.mbtiType) {
    broaderSignals.push({
      label: "Personality stack",
      signal: [
        profile.discProfile ? `DISC ${profile.discProfile}` : null,
        profile.enneagramType ? `Enneagram ${profile.enneagramType}` : null,
        profile.mbtiType ? `MBTI ${profile.mbtiType}` : null,
      ].filter(Boolean).join(" · "),
    });
  }

  // Skill highs/lows
  if (profile.skillScores.length > 0) {
    const sorted = [...profile.skillScores].sort((a, b) => b.score - a.score);
    const top = sorted[0];
    const bottom = sorted[sorted.length - 1];
    if (top) broaderSignals.push({ label: "Top skill", signal: `${top.category.replace(/_/g, " ")} (${top.score}/100)`, tone: "positive" });
    if (bottom && bottom !== top) broaderSignals.push({ label: "Lowest skill", signal: `${bottom.category.replace(/_/g, " ")} (${bottom.score}/100)`, tone: "watch" });
  }

  // Recent activity counts
  try {
    const [reviewCount, prepCount, quizCount, noteCount] = await Promise.all([
      aeProfile ? prisma.directorReview.count({ where: { aeProfileId: aeProfile.id } }) : 0,
      prisma.oneOnOnePrep.count({
        where: aeProfile ? { aeProfileId: aeProfile.id } : { directorProfileId: directorProfile!.id },
      }),
      prisma.adHocQuiz.count({
        where: aeProfile ? { aeProfileId: aeProfile.id } : { directorProfileId: directorProfile!.id },
      }),
      aeProfile ? prisma.coachingNote.count({ where: { aeProfileId: aeProfile.id } }) : 0,
    ]);
    if (reviewCount > 0) broaderSignals.push({ label: "Monthly reviews", signal: `${reviewCount} on file` });
    if (prepCount > 0) broaderSignals.push({ label: "1:1 preps", signal: `${prepCount} sessions` });
    if (quizCount > 0) broaderSignals.push({ label: "Quizzes sent", signal: `${quizCount}` });
    if (noteCount > 0) broaderSignals.push({ label: "Coaching notes", signal: `${noteCount}` });
  } catch (e) {
    console.warn("[profile-detail] activity counts failed:", e);
  }

  // ----- Score history (skills only) -----
  let scoreHistory: Array<{ category: string; score: number; recordedAt: string; source: string }> = [];
  if (aeProfile && tagPrefixes.length > 0) {
    const skillCats = new Set<string>();
    for (const p of tagPrefixes) {
      if (!p.includes(":") && VALID_SKILL_CATEGORIES.has(p.toUpperCase())) {
        skillCats.add(p.toUpperCase());
      }
    }
    if (skillCats.size > 0) {
      try {
        const history = await prisma.skillScoreHistory.findMany({
          where: { aeProfileId: aeProfile.id, category: { in: Array.from(skillCats) as any } },
          orderBy: { recordedAt: "desc" },
          take: 12,
        });
        scoreHistory = history.map((h) => ({
          category: h.category,
          score: h.score,
          recordedAt: h.recordedAt.toISOString(),
          source: h.source,
        }));
      } catch (e) {
        console.warn("[profile-detail] score history fetch failed:", e);
      }
    }
  }

  // ----- Director review excerpts -----
  let reviewExcerpts: Array<{ monthOf: string; directorName: string; questionText: string; answerLabel: string }> = [];
  if (aeProfile) {
    try {
      const reviews = await prisma.directorReview.findMany({
        where: { aeProfileId: aeProfile.id },
        orderBy: { monthOf: "desc" },
        take: 6,
        include: {
          director: { select: { name: true } },
          answers: { include: { question: { select: { text: true, tagsJson: true, questionType: true, optionsJson: true } } } },
        },
      });
      for (const r of reviews) {
        for (const ra of r.answers) {
          const qTags = (ra.question.tagsJson as string[]) ?? [];
          if (qTags.some((t) => tagMatches(t, tagPrefixes))) {
            const rendered = renderAnswer(ra.value, ra.question.questionType, ra.question.optionsJson);
            reviewExcerpts.push({
              monthOf: r.monthOf.toISOString().slice(0, 7),
              directorName: r.director.name,
              questionText: ra.question.text,
              answerLabel: rendered.label,
            });
          }
        }
      }
    } catch (e) {
      console.warn("[profile-detail] review excerpts fetch failed:", e);
    }
  }
  reviewExcerpts = reviewExcerpts.slice(0, 8);

  // ----- 1:1 prep mentions -----
  let prepMentions: Array<{ date: string; preparedByName: string; summary: string; matchedSection?: string }> = [];
  if (aeProfile) {
    try {
      const preps = await prisma.oneOnOnePrep.findMany({
        where: { aeProfileId: aeProfile.id },
        orderBy: { createdAt: "desc" },
        take: 6,
        include: { preparedBy: { select: { name: true } } },
      });
      const fieldKeywords: Record<string, string[]> = {
        personality:    ["personality", "disc", "enneagram", "mbti"],
        salesstyle:     ["sales style", "discovery", "closing", "objection"],
        sales_style:    ["sales style", "discovery", "closing", "objection"],
        communication:  ["communication", "tone", "direct", "warmth"],
        motivations:    ["motivation", "drive", "fuel"],
        strengths:      ["strength", "great at", "excels"],
        weaknesses:     ["growth", "weakness", "improve", "gap"],
      };
      const keywords = (fieldKeywords[field] ?? []).map((k) => k.toLowerCase());
      for (const p of preps) {
        const json = p.generatedJson as any;
        const summary = (json?.summary ?? "") as string;
        if (!summary) continue;
        const lower = summary.toLowerCase();
        const hit = keywords.length === 0 || keywords.some((k) => lower.includes(k));
        let matchedSection: string | undefined;
        if (Array.isArray(json?.sections)) {
          for (const s of json.sections) {
            const blob = `${s.title ?? ""} ${s.bringUp ?? ""} ${s.tieToPersonality ?? ""}`.toLowerCase();
            if (keywords.some((k) => blob.includes(k))) {
              matchedSection = s.title;
              break;
            }
          }
        }
        if (hit || matchedSection) {
          prepMentions.push({
            date: p.createdAt.toISOString().slice(0, 10),
            preparedByName: p.preparedBy.name,
            summary,
            matchedSection,
          });
        }
      }
    } catch (e) {
      console.warn("[profile-detail] prep mentions fetch failed:", e);
    }
  }

  // ----- Coaching hints (leader-only) -----
  let coachingHints: string[] | null = null;
  let coachingHintsAt: Date | null = null;
  let coachingHintsAvailable = false;

  // Determine viewer permission — leader viewing this user (NOT the user themselves)
  const isLeaderViewer = LEADER_ROLES.has(ctx.role) && ctx.userId !== target.id;

  if (isLeaderViewer) {
    coachingHintsAvailable = true;
    // Read cached hints from profile
    let cachedHints: any = (profile as any).coachingHintsJson;
    let cachedAt: Date | null = (profile as any).coachingHintsAt ?? null;

    // Event-driven regeneration — only regenerate when an actual signal has
    // landed since the last cache write. Saves tokens compared to TTL-based.
    const latestSignalAt = await getLatestInputSignalAt(
      aeProfile ? { aeProfileId: aeProfile.id } : { directorProfileId: directorProfile!.id },
    );
    const stale = isStale(cachedAt, latestSignalAt);

    if (!cachedHints || stale) {
      try {
        const org = await prisma.org.findUnique({ where: { id: target.orgId }, select: { aiModel: true } });
        const recentNotes = aeProfile?.coachingNotes ?? [];
        const recentReviews = aeProfile
          ? await prisma.directorReview.findMany({
              where: { aeProfileId: aeProfile.id },
              orderBy: { monthOf: "desc" },
              take: 3,
              select: { summary: true },
            })
          : [];
        const generated = await generateCoachingHints({
          name: target.name,
          role: aeProfile ? "AE" : "DIRECTOR",
          enneagramType: profile.enneagramType,
          discProfile: profile.discProfile,
          mbtiType: profile.mbtiType,
          personalitySummary: profile.personalitySummary,
          salesStyleSummary: (aeProfile as any)?.salesStyleSummary,
          leadershipSummary: (directorProfile as any)?.leadershipSummary,
          communicationSummary: (aeProfile as any)?.communicationSummary ?? (directorProfile as any)?.forecastingSummary,
          strengths: (profile.strengthsJson as string[]) ?? [],
          weaknesses: (profile.weaknessesJson as string[]) ?? [],
          motivations: (profile.motivations as string[]) ?? [],
          skillScores: profile.skillScores.map((s: any) => ({ category: s.category, score: s.score })),
          recentNotes: recentNotes.map((n: any) => ({ date: n.createdAt.toISOString().slice(0, 10), content: n.content })),
          recentReviewSummaries: recentReviews.map((r: any) => r.summary).filter(Boolean) as string[],
        }, org?.aiModel);
        cachedHints = generated;
        cachedAt = new Date();
        // Persist BOTH the hints + the new reasoningSummary
        if (aeProfile) {
          await prisma.aeProfile.update({
            where: { id: aeProfile.id },
            data: {
              coachingHintsJson: generated as any,
              coachingHintsAt: cachedAt,
              reasoningSummary: generated.reasoningSummary || null,
              reasoningSummaryAt: cachedAt,
            },
          });
        } else {
          await prisma.directorProfile.update({
            where: { id: directorProfile!.id },
            data: {
              coachingHintsJson: generated as any,
              coachingHintsAt: cachedAt,
              reasoningSummary: generated.reasoningSummary || null,
              reasoningSummaryAt: cachedAt,
            },
          });
        }
      } catch (e) {
        console.warn("[profile-detail] coaching hints generation failed:", e);
      }
    }

    if (cachedHints) {
      const fieldKey = field === "salesstyle" || field === "sales_style" ? "salesStyle" : field;
      const raw = (cachedHints as any)[fieldKey];
      coachingHints = Array.isArray(raw) ? raw : [];
      coachingHintsAt = cachedAt;
    }
  }

  // ----- Coaching notes (existing) -----
  const notes = aeProfile ? aeProfile.coachingNotes ?? [] : [];

  return NextResponse.json({
    target,
    field,
    label,
    primaryText,
    primaryList,
    supportingAnswers: supportingAnswers.slice(0, 25),
    answerSetCompletedAt,
    coachingNotes: notes.map((n: any) => ({
      date: n.createdAt.toISOString().slice(0, 10),
      content: n.content,
      directorName: n.director.name,
    })),
    scoreHistory,
    reviewExcerpts,
    prepMentions,
    broaderSignals,
    coachingHints,
    coachingHintsAvailable,
    coachingHintsAt: coachingHintsAt?.toISOString() ?? null,
    viewerIsLeader: isLeaderViewer,
  });
}
