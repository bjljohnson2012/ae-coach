import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { EditUserForm } from "./EditUserForm";

export default async function EditUserPage({ params }: { params: { id: string } }) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN", "VP_SALES");
  const user = await prisma.user.findUnique({
    where: { id: params.id },
    include: { org: { select: { name: true } } },
  });
  if (!user) notFound();
  if (ctx.role !== "ORG_ADMIN" && user.orgId !== ctx.effectiveOrgId) notFound();
  if (ctx.role === "VP_SALES" && !(user.role === "DIRECTOR" && user.vpId === ctx.userId) && user.role !== "AE") {
    notFound();
  }

  const vps = await prisma.user.findMany({
    where: { role: "VP_SALES", orgId: user.orgId },
    select: { id: true, name: true },
  });

  return (
    <div className="page max-w-2xl">
      <Link href="/admin/users" className="link text-sm">← Users</Link>
      <h1 className="h-page mt-2">{user.name}</h1>
      <p className="meta mt-1 mb-6">{user.email} · {user.org.name}</p>
      <EditUserForm
        user={{
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          vpId: user.vpId,
          imageUrl: user.imageUrl,
        }}
        vps={vps}
        actorRole={ctx.role}
      />
    </div>
  );
}
