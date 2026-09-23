import { AppShell } from "@/components/AppShell";
import { Footer } from "@/components/Footer";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { BrandTheme } from "@/components/BrandTheme";
import { requireSession, getImpersonationStatus } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireSession();
  const user = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { imageUrl: true } });
  const org = await prisma.org.findUnique({
    where: { id: ctx.effectiveOrgId },
    select: { brandPalette: true, brandColor: true },
  });

  const impersonation = await getImpersonationStatus();

  let pendingTaskCount = 0;
  if (ctx.role === "AE") {
    const ae = await prisma.aeProfile.findUnique({ where: { userId: ctx.userId }, select: { id: true } });
    if (ae) {
      pendingTaskCount = await prisma.task.count({
        where: { aeProfileId: ae.id, status: { in: ["OPEN", "IN_PROGRESS"] } },
      });
    }
  }

  return (
    <>
      <BrandTheme palette={(org?.brandPalette as any) ?? null} fallbackPrimary={org?.brandColor ?? null} />
      {impersonation?.isImpersonating && impersonation.targetName && (
        <ImpersonationBanner targetName={impersonation.targetName} targetRole={impersonation.targetRole ?? ""} />
      )}
      <AppShell
        user={{ name: ctx.name, email: ctx.email, role: ctx.role, imageUrl: user?.imageUrl ?? null }}
        pendingTaskCount={pendingTaskCount}
      >
        {children}
      </AppShell>
      <Footer />
    </>
  );
}
