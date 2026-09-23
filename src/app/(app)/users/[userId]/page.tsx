/**
 * Universal user profile dispatch.
 *
 * Anyone with a User record gets a profile page — whether they're an AE,
 * Director, VP, Company Admin, or Super Admin. This page resolves the user
 * to their profile type and forwards to the right existing view:
 *
 *   AE       → /director/ae/[aeProfileId]
 *   Anyone with a DirectorProfile (Director, VP, Company Admin, Super Admin)
 *            → /director/director/[directorProfileId]
 *   Otherwise (no synthesized profile yet) → empty-state page with CTA
 *
 * The empty state nudges the user toward intake completion. Other people
 * looking at this user see a "they haven't done their intake yet" message.
 */
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { requireSession } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { prettyRole } from "@/lib/roleLabels";

export default async function UniversalProfilePage({ params }: { params: { userId: string } }) {
  const ctx = await requireSession();

  const target = await prisma.user.findUnique({
    where: { id: params.userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      orgId: true,
      org: { select: { name: true, brandColor: true } },
      aeProfile: { select: { id: true } },
      directorProfile: { select: { id: true } },
    },
  });
  if (!target) notFound();

  // Org-boundary check: only Super Admin sees cross-org.
  if (ctx.role !== "ORG_ADMIN" && target.orgId !== ctx.effectiveOrgId) {
    notFound();
  }

  // AE → existing AE profile page
  if (target.aeProfile) {
    redirect(`/director/ae/${target.aeProfile.id}`);
  }

  // Anyone with a DirectorProfile → existing director profile page
  if (target.directorProfile) {
    redirect(`/director/director/${target.directorProfile.id}`);
  }

  // No profile yet — show an empty state. Different copy depending on whether
  // the viewer IS the user (self-view → nudge to do intake) or someone else
  // (peer view → "they haven't done it yet").
  const isSelf = target.id === ctx.userId;
  const intakeUrl = target.role === "AE" ? "/ae/intake" : "/director/intake";

  return (
    <div className="page max-w-2xl">
      <div className="mb-3">
        <Link href="/dashboard" className="link text-sm">← Dashboard</Link>
      </div>
      <header className="mb-6">
        <div className="eyebrow mb-1">Profile</div>
        <h1 className="h-page">{target.name}</h1>
        <p className="text-sm text-ink-muted mt-1">
          {target.email} · {prettyRole(target.role)} · {target.org.name}
        </p>
      </header>

      <section className="card p-8 text-center">
        <div className="text-3xl mb-3" aria-hidden="true">📋</div>
        <h2 className="h-section">
          {isSelf ? "Build your profile" : `${target.name} hasn't built their profile yet`}
        </h2>
        <p className="text-sm text-ink-muted mt-2 max-w-md mx-auto">
          {isSelf
            ? "The platform's coaching power comes from your personality + skill profile. Take 10–12 minutes to complete your intake so the AI can help you and your team."
            : "They need to complete their intake before this profile is available. Send them a nudge — it takes about 10 minutes."}
        </p>
        {isSelf && (
          <Link href={intakeUrl} className="btn-primary mt-5 inline-block">
            Start your intake →
          </Link>
        )}
      </section>
    </div>
  );
}
