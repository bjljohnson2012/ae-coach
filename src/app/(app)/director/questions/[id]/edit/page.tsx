import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { EditQuestionForm } from "./EditQuestionForm";

export default async function EditQuestionPage({ params }: { params: { id: string } }) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const q = await prisma.question.findUnique({ where: { id: params.id } });
  if (!q) notFound();

  const canEdit =
    ctx.role === "ORG_ADMIN" ||
    ctx.role === "COMPANY_ADMIN" ||
    q.authorUserId === ctx.userId;

  if (!canEdit) {
    return (
      <div className="page max-w-2xl">
        <div className="card p-8 text-center">
          <h1 className="h-section">Read-only</h1>
          <p className="text-sm text-ink-muted mt-2">
            Only the author or an admin can edit this question.
          </p>
          <Link href="/director/questions" className="btn-secondary mt-4 inline-flex">← Back</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page max-w-3xl">
      <Link href="/director/questions" className="link text-sm">← Back to Question Bank</Link>
      <h1 className="h-page mt-2">Edit Question</h1>
      <p className="mt-1 text-sm text-ink-muted mb-6">
        {q.aiGenerated ? "AI-generated. Original text preserved on first edit." : "Manually authored."}
      </p>
      <EditQuestionForm question={q as any} />
    </div>
  );
}
