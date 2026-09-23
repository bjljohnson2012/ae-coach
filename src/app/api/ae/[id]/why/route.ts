/**
 * GET /api/ae/[id]/why?kind=skill&value=DISCOVERY
 * GET /api/ae/[id]/why?kind=personality&value=ENNEAGRAM:9
 *
 * Returns the answers from this AE's most recent COMPLETED AnswerSet that
 * contributed to the requested skill score or personality determination.
 *
 * Response shape:
 *   {
 *     summary: { score?, level?, source?, notes?, label, value },
 *     answers: [
 *       { questionText, questionType, value, optionLabel?, tagsThatMatched: [...] }
 *     ],
 *     strengthsOrWeaknesses?: string[]
 *   }
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, assertCanAccessAe } from "@/lib/tenancy";

export const runtime = "nodejs";

function tagMatches(tag: string, target: string): boolean {
  if (!tag) return false;
  // Trim "+10" or "-5" off skill tags. Also handle "MOTIVATION:money" vs "MOTIVATION".
  const baseTag = tag.split(/[:+\-]/)[0].toUpperCase() + (tag.includes(":") ? `:${tag.split(":")[1].split(/[+\-]/)[0]}` : "");
  const targetUp = target.toUpperCase();
  // For exact category-only target like "DISCOVERY", match any tag starting with DISCOVERY
  if (!target.includes(":")) {
    return tag.toUpperCase().startsWith(targetUp);
  }
  // For specific target like "ENNEAGRAM:9", exact match the prefix before any +/-
  return baseTag.startsWith(targetUp);
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN", "AE");
  if (ctx.role === "AE") {
    const ae = await prisma.aeProfile.findUnique({ where: { id: params.id }, select: { userId: true } });
    if (ae?.userId !== ctx.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else {
    const access = await assertCanAccessAe(ctx, params.id);
    if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind") || "skill";
  const value = searchParams.get("value") || "";
  if (!value) return NextResponse.json({ error: "Missing value" }, { status: 400 });

  const ae = await prisma.aeProfile.findUnique({
    where: { id: params.id },
    include: {
      skillScores: true,
      user: { select: { name: true } },
    },
  });
  if (!ae) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Latest completed answer set
  const latestSet = await prisma.answerSet.findFirst({
    where: { aeProfileId: params.id, status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    include: {
      answers: {
        include: {
          question: { select: { id: true, text: true, questionType: true, optionsJson: true, tagsJson: true, category: true } },
        },
      },
    },
  });

  // Skill summary
  let summary: any = { kind, value, label: value };
  if (kind === "skill") {
    const cat = value.toUpperCase();
    const score = ae.skillScores.find((s) => s.category === cat);
    summary = {
      kind, value, label: cat.replace(/_/g, " "),
      score: score?.score ?? null,
      level: score?.level ?? null,
      source: score?.source ?? null,
      notes: score?.notes ?? null,
    };
  } else if (kind === "personality") {
    summary = { kind, value, label: value };
    const valueLower = value.toLowerCase();
    if (valueLower.startsWith("enneagram:")) summary.summaryText = `Type ${value.split(":")[1]}`;
    else if (valueLower.startsWith("disc:")) summary.summaryText = `DISC ${value.split(":")[1]}`;
    else if (valueLower.startsWith("mbti:")) summary.summaryText = `MBTI ${value.split(":")[1]}`;
  }

  // Find contributing answers
  const matched: Array<{
    questionId: string;
    questionText: string;
    questionType: string;
    questionTags: string[];
    answerValue: any;
    optionLabel: string | null;
    optionTags: string[];
    matchedTags: string[];
  }> = [];

  if (latestSet) {
    for (const ans of latestSet.answers) {
      const qTags = (ans.question.tagsJson as string[]) ?? [];
      const opts = ans.question.optionsJson as any[] | null;
      const matchedTags: string[] = [];

      // Question-level tags
      for (const t of qTags) {
        if (tagMatches(t, value)) matchedTags.push(t);
      }

      // For MC, check option-level tags using the answered value
      let optionLabel: string | null = null;
      let optionTags: string[] = [];
      if (ans.question.questionType === "MULTIPLE_CHOICE" && Array.isArray(opts)) {
        const chosen = opts.find((o) => o?.value === (ans.value as any)?.value || o?.value === ans.value);
        if (chosen) {
          optionLabel = chosen.label ?? null;
          optionTags = Array.isArray(chosen.tags) ? chosen.tags : [];
          for (const t of optionTags) {
            if (tagMatches(t, value)) matchedTags.push(t);
          }
        }
      }

      if (matchedTags.length > 0) {
        matched.push({
          questionId: ans.question.id,
          questionText: ans.question.text,
          questionType: ans.question.questionType,
          questionTags: qTags,
          answerValue: ans.value,
          optionLabel,
          optionTags,
          matchedTags,
        });
      }
    }
  }

  // Personality summary fields from the AE
  const personalityContext: any = {};
  if (kind === "personality") {
    const head = value.split(":")[0].toLowerCase();
    if (head === "enneagram") personalityContext.aeValue = ae.enneagramType;
    if (head === "disc") personalityContext.aeValue = ae.discProfile;
    if (head === "mbti") personalityContext.aeValue = ae.mbtiType;
    personalityContext.personalitySummary = ae.personalitySummary;
  } else {
    const cat = value.toUpperCase();
    const strengths = (ae.strengthsJson as string[]) ?? [];
    const weaknesses = (ae.weaknessesJson as string[]) ?? [];
    personalityContext.salesStyleSummary = ae.salesStyleSummary;
    personalityContext.communicationSummary = ae.communicationSummary;
    personalityContext.relevantStrengths = strengths.filter((s) => s.toUpperCase().includes(cat) || cat.includes(s.toUpperCase().split(" ")[0]));
    personalityContext.relevantWeaknesses = weaknesses.filter((s) => s.toUpperCase().includes(cat) || cat.includes(s.toUpperCase().split(" ")[0]));
  }

  return NextResponse.json({
    aeName: ae.user.name,
    summary,
    answers: matched,
    answerSetCompletedAt: latestSet?.completedAt ?? null,
    context: personalityContext,
  });
}
