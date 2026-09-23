/**
 * POST /api/questions/enhance-option
 * Body: { questionText, questionCategory, option, goal? }
 * Returns refined { label, tags, rationale } without persisting.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/tenancy";
import { enhanceMcOption } from "@/lib/ai";

const Body = z.object({
  questionText: z.string().min(2),
  questionCategory: z.string().min(1),
  option: z.object({
    value: z.string(),
    label: z.string(),
    tags: z.array(z.string()).default([]),
  }),
  goal: z.enum(["clearer", "shorter", "more diagnostic", "score-tag review"]).optional(),
});

export async function POST(req: Request) {
  await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  try {
    const result = await enhanceMcOption({
      questionText: parsed.data.questionText,
      questionCategory: parsed.data.questionCategory,
      current: parsed.data.option,
      goal: parsed.data.goal,
    });
    return NextResponse.json({ result });
  } catch (e: any) {
    return NextResponse.json({ error: `AI enhance failed: ${e?.message ?? "unknown"}` }, { status: 502 });
  }
}
