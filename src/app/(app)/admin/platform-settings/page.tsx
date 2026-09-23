import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";

export default async function PlatformSettingsPage() {
  const ctx = await requireRole("ORG_ADMIN");

  // Find the ORG_ADMIN's home org (the platform org)
  const platformOrg = await prisma.org.findFirst({
    where: { users: { some: { id: ctx.userId, role: "ORG_ADMIN" } } },
    select: { id: true, name: true },
  });
  if (!platformOrg) redirect("/admin/orgs");

  // We reuse the existing /admin/orgs/[id]/edit page — just deep-link to it.
  redirect(`/admin/orgs/${platformOrg.id}/edit?platform=1`);
}
