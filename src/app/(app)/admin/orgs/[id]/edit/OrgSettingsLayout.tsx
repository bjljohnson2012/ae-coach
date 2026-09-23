"use client";
import { useState, type ReactNode } from "react";
import { OrgEditor, type OrgEditorSection } from "./OrgEditor";
import { SkillsBenchmarkPanel } from "./SkillsBenchmarkPanel";

/**
 * v3.35 — Tabbed org settings layout.
 *
 * Replaces the long top-to-bottom scroll on /admin/orgs/[id]/edit.
 *
 * Tabs:
 *   - Onboarding    → AI website refresh / intake setup
 *   - Branding      → logo + brand palette
 *   - Preferences   → AI model, sales methodology, values, required skills
 *   - Technical     → SMTP, AI usage estimate, people roster, lifecycle/export
 *   - Skills        → "What good looks like" per-skill benchmarks (own panel)
 *
 * OrgEditor stays mounted across the four "editor" tabs so unsaved form
 * state is preserved when the admin switches between sections. The Skills
 * tab uses a separate panel because its data and save flow are independent.
 *
 * The technical tab also renders any server-rendered children passed as
 * `technicalExtras` (people roster, lifecycle / export panel) — these are
 * server components rendered upstream and slotted in.
 */

type Tab = "onboarding" | "branding" | "preferences" | "technical" | "skills";

const TABS: Array<{ id: Tab; label: string; description: string }> = [
  { id: "onboarding",  label: "Onboarding",  description: "Pull products + audience from your website. Re-run anytime to fill gaps." },
  { id: "branding",    label: "Branding",    description: "Logo, brand color, and the full palette that anchors the UI." },
  { id: "preferences", label: "Preferences", description: "AI model, sales methodology, org values, required skills + weights." },
  { id: "technical",   label: "Technical",   description: "SMTP, AI usage, people roster, lifecycle / data export." },
  { id: "skills",      label: "Skills",      description: "Customize what good looks like for each skill — upload references and synthesize." },
];

interface Props {
  org: {
    id: string;
    name: string;
    slug: string;
    brandColor: string | null;
    brandLogoUrl: string | null;
    websiteUrl: string | null;
    brandPalette: any;
    aiModel: string | null;
  };
  companyProfile: {
    salesMethodology: string | null;
    values: string[];
    requiredSkills: Array<{ category: string; weight: number; custom?: boolean }>;
    smtpHost: string | null;
    smtpPort: number | null;
    smtpSecure: boolean;
    smtpUser: string | null;
    smtpPassSet: boolean;
    smtpFrom: string | null;
    /** v3.37 — gamified self-coach button label override. */
    improveButtonLabel: string | null;
  };
  viewerRole: "ORG_ADMIN" | "COMPANY_ADMIN";
  orgName: string;
  /** Server-rendered roster + lifecycle + export blocks. Shown only on Technical tab. */
  technicalExtras: ReactNode;
}

export function OrgSettingsLayout({ org, companyProfile, viewerRole, orgName, technicalExtras }: Props) {
  const [tab, setTab] = useState<Tab>("onboarding");
  const active = TABS.find((t) => t.id === tab);

  return (
    <div>
      {/* Tab nav — responsive: dropdown on phones, segmented pill row on tablets+
          so the page never has to scroll horizontally. */}

      {/* Mobile: select dropdown (≤ sm) */}
      <div className="sm:hidden mb-3">
        <label htmlFor="org-settings-tab" className="label">Section</label>
        <select
          id="org-settings-tab"
          className="input"
          value={tab}
          onChange={(e) => setTab(e.target.value as Tab)}
        >
          {TABS.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Tablet+: segmented pill row, wraps onto a second line if needed. */}
      <nav
        role="tablist"
        aria-label="Org settings sections"
        className="hidden sm:flex flex-wrap gap-1 border-b border-ink-softLine mb-2"
      >
        {TABS.map((t) => {
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 lg:px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                isActive
                  ? "border-brand-orange text-brand-indigo"
                  : "border-transparent text-ink-muted hover:text-ink-slate"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      {active && (
        <p className="text-sm text-ink-muted mt-3 mb-5">{active.description}</p>
      )}

      {/* Editor tabs share OrgEditor instance — keep it mounted across the four
          editor tabs so unsaved field state survives tab switches. */}
      <div className={tab === "skills" ? "hidden" : ""}>
        <OrgEditor
          org={org}
          companyProfile={companyProfile}
          viewerRole={viewerRole}
          section={tab as OrgEditorSection}
        />
        {tab === "technical" && (
          <div className="mt-8">{technicalExtras}</div>
        )}
      </div>

      {/* Skills tab — independent panel with its own save flow. */}
      <div className={tab === "skills" ? "" : "hidden"}>
        <SkillsBenchmarkPanel orgId={org.id} orgName={orgName} />
      </div>
    </div>
  );
}
