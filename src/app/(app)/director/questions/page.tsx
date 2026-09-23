import Link from "next/link";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { CollapsibleSection } from "./CollapsibleSection";
import { OrgPicker } from "@/components/OrgPicker";

const CATEGORIES = [
  "SALES_STYLE",
  "COMMUNICATION",
  "PERSONALITY",
  "ENNEAGRAM",
  "DISC",
  "MBTI",
  "MOTIVATION",
  "RESILIENCE",
  "PRODUCT_KNOWLEDGE",
  "LEADERSHIP",
  "DIRECTOR_MONTHLY_REVIEW",
];

/**
 * Question bank page.
 *
 * Audience-aware view:
 *   - DIRECTOR / VP_SALES / COMPANY_ADMIN: see global + their own org's questions (no toggle).
 *   - ORG_ADMIN: gets a "View" pill row to switch between:
 *       - All        (default — global + every org's bank)
 *       - Global     (orgId: null only)
 *       - [Company]  (a specific customer org's bank)
 *     The pill state is controlled via ?view=all|global|<orgId>.
 */
export default async function QuestionsListPage({
  searchParams,
}: {
  searchParams: { view?: string };
}) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const isOrgAdmin = ctx.role === "ORG_ADMIN";
  const view = isOrgAdmin ? (searchParams.view || "all") : "default";

  // For super admin: pull every ACTIVE customer org with users but no super admin.
  // Inactive / offboarded orgs are excluded so they don't clutter the picker.
  type OrgPickerItem = { id: string; name: string; brandColor: string | null };
  const customerOrgs: OrgPickerItem[] = isOrgAdmin
    ? ((await prisma.org.findMany({
        where: {
          status: "ACTIVE" as any,
          users: {
            some: {},
            none: { role: "ORG_ADMIN" },
          },
        },
        select: { id: true, name: true, brandColor: true },
        orderBy: { name: "asc" },
      })) as OrgPickerItem[])
    : [];

  // Translate the view selector into a Prisma where clause.
  let where: any;
  if (isOrgAdmin) {
    if (view === "global") {
      where = { orgId: null };
    } else if (view === "all") {
      where = {}; // every question, every org + global
    } else {
      // view is a specific orgId
      where = { OR: [{ orgId: null }, { orgId: view }] };
    }
  } else {
    // Non-admins: own org + global. Always.
    where = { OR: [{ orgId: ctx.effectiveOrgId }, { orgId: null }] };
  }

  const questions = await prisma.question.findMany({
    where,
    orderBy: [{ category: "asc" }, { orderHint: "asc" }],
    include: { product: { select: { name: true } }, org: { select: { name: true } } },
  });

  const grouped: Record<string, typeof questions> = {};
  for (const q of questions) {
    grouped[q.category] = grouped[q.category] || [];
    grouped[q.category].push(q);
  }

  const canEditAny = ctx.role === "ORG_ADMIN" || ctx.role === "COMPANY_ADMIN";

  // Build the subhead string that explains the active scope
  let scopeLine: string;
  if (!isOrgAdmin) {
    scopeLine = `${questions.length} questions visible to your org (global + your authored).`;
  } else if (view === "global") {
    scopeLine = `${questions.length} platform-wide questions. These are inherited by every customer org.`;
  } else if (view === "all") {
    scopeLine = `${questions.length} questions across the platform + every customer org.`;
  } else {
    const o = customerOrgs.find((x) => x.id === view);
    scopeLine = `${questions.length} questions visible to ${o?.name ?? "this org"} (global + their own authored).`;
  }

  // Counts for pill labels
  const globalCount = await prisma.question.count({ where: { orgId: null } });
  const orgCounts: Record<string, number> = {};
  if (isOrgAdmin) {
    const grouped2 = await prisma.question.groupBy({
      by: ["orgId"],
      where: { orgId: { in: customerOrgs.map((o) => o.id) } },
      _count: true,
    });
    for (const g of grouped2) {
      if (g.orgId) orgCounts[g.orgId] = (g as any)._count;
    }
  }

  // For "+ New Question" — pre-fill the targetOrgId if a specific company is selected
  const newQuestionHref =
    isOrgAdmin && view !== "all" && view !== "global"
      ? `/director/questions/new?targetOrgId=${view}`
      : "/director/questions/new";

  return (
    <div className="page">
      <header className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <div className="eyebrow mb-2">Authoring</div>
          <h1 className="h-page">Question Bank</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {scopeLine}{" "}
            {canEditAny ? "You can edit any question." : "You can edit questions you authored."}
          </p>
        </div>
        <Link href={newQuestionHref} className="btn-primary">+ New Question</Link>
      </header>

      {/* ORG_ADMIN view picker — searchable dropdown so it scales to dozens of orgs. */}
      {isOrgAdmin && (
        <section className="mb-6">
          <div className="eyebrow mb-2">View</div>
          <OrgPicker
            orgs={customerOrgs.map((o) => ({
              id: o.id,
              name: o.name,
              brandColor: o.brandColor,
              count: orgCounts[o.id] ?? 0,
            }))}
            selectedValue={view === "all" ? "" : view}
            paramKey="view"
            routeBase="/director/questions"
            allLabel="All (platform + every customer)"
            totalCount={globalCount + Object.values(orgCounts).reduce((a, b) => a + b, 0)}
            extraOptions={[
              { value: "global", label: "Platform (global)", emoji: "🌐", count: globalCount },
            ]}
          />
        </section>
      )}

      {/* All sections — collapsed by default. Click header to expand. */}
      <div className="space-y-3">
        {CATEGORIES.map((cat) => {
          const qs = grouped[cat] ?? [];
          return (
            <CollapsibleSection
              key={cat}
              category={cat}
              prettyCategory={prettyCat(cat)}
              questions={qs.map((q: any) => ({
                id: q.id,
                text: q.text,
                questionType: q.questionType,
                active: q.active,
                aiGenerated: q.aiGenerated,
                authorUserId: q.authorUserId,
                product: q.product ? { name: q.product.name } : null,
                // Pass org name through so the row can show "owned by [Company]"
                // when the super admin is viewing All.
                ownerOrgName: q.org?.name ?? (q.orgId === null ? null : null),
                isGlobal: q.orgId === null,
              }))}
              canEditAny={canEditAny}
              currentUserId={ctx.userId}
            />
          );
        })}
      </div>
    </div>
  );
}

function prettyCat(cat: string) {
  return cat
    .replace("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
