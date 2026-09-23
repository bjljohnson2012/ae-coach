import Link from "next/link";
import { requireSession } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { AccountForm } from "./AccountForm";
import { PasswordForm } from "./PasswordForm";
import { ExportMyDataButton } from "./ExportMyDataButton";
import { WeeklyBriefToggle } from "./WeeklyBriefToggle";
import { prettyRole } from "@/lib/roleLabels";

const ROLE_PERMISSIONS: Record<string, { canSee: string[]; canDo: string[] }> = {
  ORG_ADMIN: {
    canSee: [
      "Every org on the platform",
      "Every user across all orgs",
      "All AE skill cards, profiles, and coaching artifacts",
      "Full audit log",
    ],
    canDo: [
      "Create, edit, and delete orgs",
      "Invite users at any role (including Super Admin)",
      "Move users between orgs",
      "Edit any question, article, file, or product",
      "Override skill scores",
    ],
  },
  COMPANY_ADMIN: {
    canSee: [
      "Everything inside your org",
      "All users in your org and what they're doing",
      "All AE profiles and coaching content",
    ],
    canDo: [
      "Edit org branding and sales preferences",
      "Invite users (any role except Super Admin) into your org",
      "Edit/deactivate users in your org",
      "Author + edit any question, article, or product",
      "Override skill scores",
    ],
  },
  VP_SALES: {
    canSee: [
      "Your reporting tree (Directors + their AEs)",
      "Skill cards, intake responses, and prep docs in your tree",
      "Org-wide knowledge libraries (except director-only personality content if not in your tree)",
    ],
    canDo: [
      "Coach Directors and AEs in your tree",
      "Run monthly + ad-hoc reviews",
      "Edit users in your reporting chain",
      "Author questions and knowledge content",
    ],
  },
  DIRECTOR: {
    canSee: [
      "Your AEs and their skill cards",
      "Coaching artifacts you've uploaded for your AEs",
      "Knowledge libraries (Personality is director-only)",
    ],
    canDo: [
      "Invite AEs",
      "Run monthly + ad-hoc coaching reviews",
      "Upload prep docs and coaching docs",
      "Author questions you authored",
      "Override skill scores for your AEs",
    ],
  },
  AE: {
    canSee: [
      "Your own skill card",
      "Coaching notes your director marked visible",
      "Recommendations routed to you",
      "Tasks assigned to you (or AI-generated from your gaps)",
    ],
    canDo: [
      "Complete and resume your intake wizard",
      "Edit your name, profile picture, password",
      "View your intake responses",
      "Mark recommendations and tasks as complete",
    ],
  },
};

export default async function AccountPage() {
  const ctx = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: {
      name: true, email: true, imageUrl: true, createdAt: true, lastLoginAt: true,
      role: true, org: { select: { name: true } },
      weeklyBriefSubscribed: true,
    } as any,
  }) as any;

  const perms = ROLE_PERMISSIONS[ctx.role];

  return (
    <div className="page max-w-3xl">
      <header className="mb-6">
        <div className="eyebrow mb-2">Account</div>
        <h1 className="h-page">Settings</h1>
        <p className="mt-1 text-sm text-ink-muted">Profile, security, and what your role can do.</p>
      </header>

      <section className="card p-6 mb-4">
        <div className="eyebrow mb-3">Profile</div>
        <AccountForm
          initial={{ name: user?.name ?? "", email: user?.email ?? "", imageUrl: user?.imageUrl ?? null }}
          orgName={user?.org.name ?? "—"}
          role={user?.role ?? "AE"}
          memberSince={user?.createdAt.toLocaleDateString() ?? "—"}
          lastLogin={user?.lastLoginAt?.toLocaleDateString() ?? "Never"}
        />
      </section>

      <section className="card p-6 mb-4">
        <div className="eyebrow mb-3">Security</div>
        <PasswordForm />
      </section>

      <section className="card p-6 mb-4">
        <div className="eyebrow mb-2">Your role: {prettyRole(ctx.role)}</div>
        <p className="text-sm text-ink-muted mb-4">
          Here's what you can see and do with your access. Need more? Talk to your{" "}
          {ctx.role === "AE" ? "director" : ctx.role === "DIRECTOR" ? "VP" : ctx.role === "VP_SALES" ? "company admin" : "super admin"}.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <div className="font-display font-semibold text-ink mb-2">You can see</div>
            <ul className="space-y-1.5 text-sm">
              {perms.canSee.map((s, i) => (
                <li key={i} className="flex gap-2"><span className="text-brand-indigo font-bold">✓</span>{s}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-display font-semibold text-ink mb-2">You can do</div>
            <ul className="space-y-1.5 text-sm">
              {perms.canDo.map((s, i) => (
                <li key={i} className="flex gap-2"><span className="text-brand-orange font-bold">→</span>{s}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {ctx.role === "AE" && (
        <section className="card p-6 mb-4">
          <div className="eyebrow mb-3">Your intake</div>
          <Link href="/account/intake" className="btn-secondary">View / Edit Responses →</Link>
        </section>
      )}

      {/* Weekly improvement brief subscription */}
      <section className="card p-6 mb-4">
        <div className="eyebrow mb-3">Weekly briefs</div>
        <WeeklyBriefToggle initialEnabled={!!user?.weeklyBriefSubscribed} />
      </section>

      {/* Self-service data export — every user can download their own data */}
      <section className="card p-6">
        <div className="eyebrow mb-2">Your data</div>
        <p className="text-sm text-ink-muted mb-3">
          Download a JSON file containing every record where you are the subject — your profile,
          intake responses, skill scores, coaching artifacts about you, tasks assigned to you,
          and any reviews. We don't include your password hash.
        </p>
        <ExportMyDataButton />
      </section>
    </div>
  );
}
