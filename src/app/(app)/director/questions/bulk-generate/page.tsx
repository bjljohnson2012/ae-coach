import Link from "next/link";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { BulkGenerator } from "./BulkGenerator";
import { OrgPicker } from "@/components/OrgPicker";

export default async function BulkGeneratePage({
  searchParams,
}: {
  searchParams: { targetOrgId?: string };
}) {
  const ctx = await requireRole("ORG_ADMIN", "VP_SALES", "COMPANY_ADMIN");
  const isOrgAdmin = ctx.role === "ORG_ADMIN";

  // ORG_ADMIN can pick which customer org these questions land in.
  // Other roles always write to their own effectiveOrgId.
  const targetOrgId =
    isOrgAdmin && searchParams.targetOrgId ? searchParams.targetOrgId : undefined;
  const targetOrg = targetOrgId
    ? await prisma.org.findUnique({
        where: { id: targetOrgId },
        select: { id: true, name: true, brandColor: true },
      })
    : null;

  // Customer orgs available to ORG_ADMIN as bulk-author targets.
  const customerOrgs = isOrgAdmin
    ? await prisma.org.findMany({
        where: {
          status: "ACTIVE" as any,
          users: {
            some: {},
            none: { role: "ORG_ADMIN" },
          },
        },
        select: { id: true, name: true, brandColor: true },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div className="page max-w-3xl">
      <Link href="/director/questions" className="link text-sm">← Question Bank</Link>
      <h1 className="h-page mt-2">Bulk-generate questions</h1>
      <p className="text-sm text-ink-muted mt-1 mb-6">
        Pick categories, set how many questions per category, and Grok generates drafts in one batch.
        Drafts open for review before saving.
      </p>

      {/* ORG_ADMIN target picker — choose which company's bank to author into. */}
      {isOrgAdmin && (
        <section className="mb-5">
          <div className="eyebrow mb-2">Author into</div>
          <OrgPicker
            orgs={customerOrgs.map((o: any) => ({
              id: o.id,
              name: o.name,
              brandColor: o.brandColor,
            }))}
            selectedValue={targetOrgId ?? ""}
            paramKey="targetOrgId"
            routeBase="/director/questions/bulk-generate"
            allLabel="🌐 Platform (global) — every company inherits"
          />
          {targetOrg && (
            <p className="meta mt-2">
              These drafts will save into <strong>{targetOrg.name}</strong>'s bank only.
              Switch to "Platform (global)" to author for every customer.
            </p>
          )}
        </section>
      )}

      <BulkGenerator targetOrgId={targetOrgId} targetOrgName={targetOrg?.name} />
    </div>
  );
}
