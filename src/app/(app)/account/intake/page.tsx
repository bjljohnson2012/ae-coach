import Link from "next/link";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";

export default async function MyIntakePage() {
  const ctx = await requireRole("AE");

  const ae = await prisma.aeProfile.findUnique({
    where: { userId: ctx.userId },
    include: {
      answerSets: {
        where: { status: "COMPLETED" },
        orderBy: { version: "desc" },
        take: 1,
        include: {
          answers: {
            include: { question: { select: { id: true, text: true, category: true, questionType: true, optionsJson: true } } },
          },
        },
      },
    },
  });

  const latest = ae?.answerSets[0];

  if (!latest) {
    return (
      <div className="page max-w-3xl">
        <Link href="/account" className="link text-sm">← Account</Link>
        <h1 className="h-page mt-2">Your intake</h1>
        <div className="card p-8 mt-6 text-center">
          <p className="text-sm text-ink-muted">You haven't completed your intake yet.</p>
          <Link href="/ae/intake" className="btn-primary mt-3 inline-flex">Start intake →</Link>
        </div>
      </div>
    );
  }

  // Group by category for readability
  const grouped: Record<string, typeof latest.answers> = {};
  for (const a of latest.answers) {
    grouped[a.question.category] = grouped[a.question.category] || [];
    grouped[a.question.category].push(a);
  }

  return (
    <div className="page max-w-3xl">
      <Link href="/account" className="link text-sm">← Account</Link>
      <h1 className="h-page mt-2">Your intake</h1>
      <p className="text-sm text-ink-muted mt-1 mb-6">
        Version {latest.version} · completed {latest.completedAt?.toLocaleDateString()}.
        Editing comes in a future release; for now this is read-only.
      </p>

      <div className="space-y-4">
        {Object.entries(grouped).map(([cat, list]) => (
          <section key={cat} className="card p-5">
            <div className="eyebrow mb-3">{cat.replace("_", " ")}</div>
            <ul className="space-y-3 text-sm">
              {list.map((a) => (
                <li key={a.id} className="border-l-2 border-brand-indigo/30 pl-3 py-1">
                  <div className="font-medium text-ink">{a.question.text}</div>
                  <div className="text-ink-slate mt-1">{formatAnswer(a.value, a.question.optionsJson)}</div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function formatAnswer(value: any, optionsJson: any): string {
  if (!value) return "—";
  if (typeof value === "object") {
    if (value.text) return value.text;
    if (value.label) return value.label;
    if (value.choice && Array.isArray(optionsJson)) {
      const opt = optionsJson.find((o: any) => o.value === value.choice);
      return opt?.label ?? String(value.choice);
    }
    if (typeof value.scale === "number") return `Scale: ${value.scale}`;
  }
  return String(value);
}
