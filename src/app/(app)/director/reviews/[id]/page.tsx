import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { ReviewForm } from "./ReviewForm";

export default async function ReviewDetail({ params }: { params: { id: string } }) {
  const ctx = await requireRole("DIRECTOR", "ORG_ADMIN");
  const review = await prisma.directorReview.findUnique({
    where: { id: params.id },
    include: { aeProfile: { include: { user: { select: { name: true } } } }, answers: true },
  });
  if (!review) notFound();
  if (review.directorId !== ctx.userId && ctx.role !== "ORG_ADMIN") redirect("/director/reviews");

  const questions = await prisma.question.findMany({
    where: {
      OR: [{ orgId: ctx.effectiveOrgId }, { orgId: null }],
      category: "DIRECTOR_MONTHLY_REVIEW",
      active: true,
    },
    orderBy: { orderHint: "asc" },
  });

  if (questions.length === 0) {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <Link href="/director/reviews" className="text-sm text-neutral-500 hover:underline">← Reviews</Link>
        <h1 className="text-2xl font-semibold mt-1">Monthly Review for {review.aeProfile.user.name}</h1>
        <div className="card p-6 mt-4 bg-amber-50 border-amber-200">
          No questions configured for monthly reviews. Set up questions in{" "}
          <Link className="underline" href="/director/questions/new">/director/questions/new</Link> with category{" "}
          <code>DIRECTOR_MONTHLY_REVIEW</code>.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-8">
      <Link href="/director/reviews" className="text-sm text-neutral-500 hover:underline">← Reviews</Link>
      <h1 className="text-2xl font-semibold mt-1">Review: {review.aeProfile.user.name}</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Month: {review.monthOf.toISOString().slice(0, 7)} · due {review.dueAt.toLocaleDateString()}
      </p>

      <ReviewForm
        directorReviewId={review.id}
        completed={review.status === "COMPLETED"}
        summary={review.summary ?? null}
        questions={questions.map((q) => ({
          id: q.id,
          text: q.text,
          questionType: q.questionType,
          optionsJson: q.optionsJson,
        })) as any}
        existingAnswers={Object.fromEntries(review.answers.map((a) => [a.questionId, a.value]))}
      />
    </div>
  );
}
