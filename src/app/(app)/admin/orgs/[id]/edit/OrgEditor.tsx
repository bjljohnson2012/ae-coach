"use client";
import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { BrandSuggester } from "./BrandSuggester";
import { RefreshFromWeb } from "./RefreshFromWeb";

const STD_SKILLS = ["DISCOVERY", "OBJECTION_HANDLING", "CLOSING", "COMMUNICATION", "RESILIENCE", "PRODUCT_MASTERY"];

// v3.37.8 — both pre-May-15 working models and the post-May-15 replacements
// are listed. Admins can opt-in to the new ones early at their own risk
// (they may return empty payloads until xAI flips them on around May 15).
// See: https://docs.x.ai/developers/migration/may-15-deprecation
const AI_MODEL_OPTIONS: Array<{
  value: string;
  label: string;
  cost: "$" | "$$" | "$$$";
  blurb: string;
}> = [
  { value: "",                          label: "Auto (platform default)",    cost: "$",   blurb: "Uses whatever the platform admin set. Recommended." },
  { value: "grok-3-mini",               label: "grok-3-mini",                cost: "$",   blurb: "Cheapest. Good for cleanup, classify, simple extracts. (Stays after May 15.)" },
  { value: "grok-4-fast-non-reasoning", label: "grok-4-fast-non-reasoning",  cost: "$",   blurb: "Fast non-reasoning tier. Will be deprecated May 15 — replaced by grok-4.20." },
  { value: "grok-4-fast-reasoning",     label: "grok-4-fast-reasoning",      cost: "$$",  blurb: "Balanced. Good intake synthesis at low cost. Will be deprecated May 15 — replaced by grok-4.3." },
  { value: "grok-4.20-non-reasoning",   label: "grok-4.20 (non-reasoning)",  cost: "$",   blurb: "May 15+ replacement. Test before flipping defaults." },
  { value: "grok-4.3",                  label: "grok-4.3 (post-May 15)",     cost: "$$",  blurb: "May 15+ flagship reasoning. 1M context, three reasoning levels. Test before flipping defaults." },
];

/**
 * Which subset of sections to render. v3.35: page-level tabs let the user
 * focus on one slice at a time. Form state remains shared across all
 * sections; the save button (sticky-bottom) persists their changes regardless
 * of which tab is open.
 *   "all"          — show everything (legacy / fallback)
 *   "branding"     — brand color, logo, palette
 *   "preferences"  — AI model, sales methodology, values, required skills
 *   "technical"    — SMTP config + cost/usage estimate
 *   "onboarding"   — website refresh card (the rest of onboarding lives outside)
 */
export type OrgEditorSection = "all" | "branding" | "preferences" | "technical" | "onboarding";

interface Props {
  org: {
    id: string;
    name: string;
    slug: string;
    brandColor: string | null;
    brandLogoUrl: string | null;
    websiteUrl: string | null;
    brandPalette: BrandPalette | null;
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
    /** v3.37 — gamified self-coach button label. Default null → "Improve". */
    improveButtonLabel: string | null;
  };
  // Role of the viewer — only ORG_ADMIN can edit aiModel
  viewerRole: "ORG_ADMIN" | "COMPANY_ADMIN";
  // Filter which sections render. Defaults to "all" for backwards compat.
  section?: OrgEditorSection;
}

interface BrandPalette {
  primary?: string;
  secondary?: string;
  accent?: string;
  neutral?: string;
  success?: string;
  warning?: string;
  danger?: string;
}

const PALETTE_DEFAULTS: Required<BrandPalette> = {
  primary:   "#1F3C88",
  secondary: "#0B1F3A",
  accent:    "#FF6A1A",
  neutral:   "#3B4A5A",
  success:   "#0E9F6E",
  warning:   "#F59E0B",
  danger:    "#DC2626",
};

export function OrgEditor({ org, companyProfile, viewerRole, section = "all" }: Props) {
  // Per-section visibility helper — keeps the JSX tidy.
  const show = (s: OrgEditorSection) => section === "all" || section === s;
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const isOrgAdmin = viewerRole === "ORG_ADMIN";

  const [name, setName] = useState(org.name);
  const [brandColor, setBrandColor] = useState(org.brandColor ?? "#1F3C88");
  const [brandLogoUrl, setBrandLogoUrl] = useState(org.brandLogoUrl ?? "");
  const [salesMethodology, setSalesMethodology] = useState(companyProfile.salesMethodology ?? "");
  const [valuesText, setValuesText] = useState(companyProfile.values.join("\n"));
  const [improveButtonLabel, setImproveButtonLabel] = useState(companyProfile.improveButtonLabel ?? "");

  // Logo search
  const [logoQuery, setLogoQuery] = useState(org.websiteUrl ?? "");
  const [logoLooking, setLogoLooking] = useState(false);
  const [logoLookupMsg, setLogoLookupMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // AI model
  const [aiModel, setAiModel] = useState(org.aiModel ?? "");

  // Brand palette
  const [palette, setPalette] = useState<BrandPalette>(() => ({
    ...PALETTE_DEFAULTS,
    ...(org.brandPalette ?? {}),
    primary: org.brandPalette?.primary ?? org.brandColor ?? PALETTE_DEFAULTS.primary,
  }));

  // Skills
  const [skills, setSkills] = useState<Array<{ category: string; weight: number; custom?: boolean }>>(() => {
    const map = new Map(companyProfile.requiredSkills.map((s) => [s.category, s]));
    const std = STD_SKILLS.map((cat) => map.get(cat) ?? { category: cat, weight: 1.0 });
    const custom = companyProfile.requiredSkills.filter((s) => !STD_SKILLS.includes(s.category)).map((s) => ({ ...s, custom: true }));
    return [...std, ...custom];
  });
  const [newSkillName, setNewSkillName] = useState("");

  // SMTP
  const [smtpHost, setSmtpHost] = useState(companyProfile.smtpHost ?? "");
  const [smtpPort, setSmtpPort] = useState<number>(companyProfile.smtpPort ?? 587);
  const [smtpSecure, setSmtpSecure] = useState(companyProfile.smtpSecure);
  const [smtpUser, setSmtpUser] = useState(companyProfile.smtpUser ?? "");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpPassSet, setSmtpPassSet] = useState(companyProfile.smtpPassSet);
  const [smtpFrom, setSmtpFrom] = useState(companyProfile.smtpFrom ?? "");
  const [testing, setTesting] = useState(false);
  const [smtpTestMsg, setSmtpTestMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function uploadLogo(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/files/upload", { method: "POST", body: fd });
    setUploading(false);
    if (!res.ok) {
      setMsg({ kind: "err", text: "Logo upload failed." });
      return;
    }
    const j = await res.json();
    setBrandLogoUrl(`/api/files/raw?path=${encodeURIComponent(j.upload.storagePath)}`);
    setMsg({ kind: "ok", text: "Logo uploaded. Save to apply." });
  }

  async function searchLogo() {
    if (!logoQuery.trim()) {
      setLogoLookupMsg({ kind: "err", text: "Enter a website URL or company name first." });
      return;
    }
    setLogoLooking(true);
    setLogoLookupMsg(null);
    const res = await fetch("/api/orgs/lookup-logo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: logoQuery.trim() }),
    });
    setLogoLooking(false);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLogoLookupMsg({ kind: "err", text: j.error || "Logo search failed." });
      return;
    }
    setBrandLogoUrl(j.logoUrl);
    setLogoLookupMsg({
      kind: "ok",
      text: `Found via ${j.source} for ${j.domain}. Save to apply.`,
    });
  }

  function addCustomSkill() {
    const cat = newSkillName.trim().toUpperCase().replace(/\s+/g, "_").slice(0, 32);
    if (!cat || skills.some((s) => s.category === cat)) return;
    setSkills([...skills, { category: cat, weight: 1.0, custom: true }]);
    setNewSkillName("");
  }
  function setWeight(idx: number, w: number) { setSkills(skills.map((s, i) => i === idx ? { ...s, weight: w } : s)); }
  function removeSkill(idx: number) { setSkills(skills.filter((_, i) => i !== idx)); }

  function setPaletteColor(key: keyof BrandPalette, value: string) {
    setPalette((p) => ({ ...p, [key]: value }));
  }

  async function save() {
    setSaving(true); setMsg(null);
    const values = valuesText.split("\n").map((s) => s.trim()).filter(Boolean);

    const smtpPatch: any = {
      smtpHost: smtpHost.trim() || null,
      smtpPort: smtpPort || null,
      smtpSecure,
      smtpUser: smtpUser.trim() || null,
      smtpFrom: smtpFrom.trim() || null,
    };
    if (smtpPass) smtpPatch.smtpPass = smtpPass;

    const body: any = {
      name,
      brandColor: palette.primary || brandColor,  // keep legacy field in sync with palette primary
      brandLogoUrl: brandLogoUrl || null,
      brandPalette: palette,
      websiteUrl: logoQuery.trim() || null,
      companyProfile: {
        salesMethodology: salesMethodology || null,
        values,
        requiredSkills: skills.map(({ category, weight }) => ({ category, weight })),
        improveButtonLabel: improveButtonLabel.trim() || null,
        ...smtpPatch,
      },
    };
    // Only ORG_ADMIN can change the model. COMPANY_ADMIN sees it but can't write.
    if (isOrgAdmin) {
      body.aiModel = aiModel || null;
    }

    const res = await fetch(`/api/orgs/${org.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setMsg({ kind: "err", text: err.error || "Save failed." });
      return;
    }
    setMsg({ kind: "ok", text: "Saved." });
    if (smtpPass) setSmtpPassSet(true);
    setSmtpPass("");
    router.refresh();
  }

  async function testSmtp() {
    setTesting(true); setSmtpTestMsg(null);
    const res = await fetch(`/api/orgs/${org.id}/test-email`, { method: "POST" });
    setTesting(false);
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.ok) {
      setSmtpTestMsg({ kind: "ok", text: `Test email sent to ${j.sentTo}. Source: ${j.source ?? "smtp"}.` });
    } else {
      setSmtpTestMsg({ kind: "err", text: j.error ?? "Test failed." });
    }
  }

  return (
    <div className="space-y-4">
      {/* Onboarding / refresh from website */}
      {show("onboarding") && (
        <section className="card p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-[240px]">
              <div className="eyebrow">AI onboarding</div>
              <p className="text-sm text-ink-muted mt-0.5">
                Paste your company URL — we pull your products, identify your audience, and seed your Knowledge library.
                Run again anytime to fill in gaps.
              </p>
            </div>
            <RefreshFromWeb orgId={org.id} currentUrl={org.websiteUrl} />
          </div>
        </section>
      )}

      {/* AI model — ORG_ADMIN editable, COMPANY_ADMIN read-only */}
      {show("preferences") && (
      <section className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="eyebrow">AI model</div>
            <p className="text-sm text-ink-muted mt-0.5">
              The model used for synthesis (intake, monthly review, recommendations).
              Cleanup operations always use the cheap fast tier — no setting changes that.
            </p>
          </div>
        </div>
        {isOrgAdmin ? (
          <>
            <select
              className="input"
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
            >
              {AI_MODEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.cost} · {opt.label}
                </option>
              ))}
            </select>
            <div className="meta mt-1">
              {AI_MODEL_OPTIONS.find((o) => o.value === aiModel)?.blurb}
            </div>
          </>
        ) : (
          <div className="border border-ink-softLine rounded-brand p-3 bg-surface-soft text-sm">
            <div className="font-mono">{org.aiModel || "Auto (platform default)"}</div>
            <div className="meta mt-1">Only the platform admin can change this.</div>
          </div>
        )}
      </section>
      )}

      {/* Branding */}
      {show("branding") && (
      <section className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="eyebrow">Branding</div>
          <BrandSuggester orgId={org.id} onPick={(p) => {
            setBrandColor(p.primary);
            setPalette((cur) => ({ ...cur, primary: p.primary, secondary: p.secondary, accent: p.accent, neutral: p.neutral }));
          }} />
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          {brandLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brandLogoUrl} alt="" className="w-16 h-16 rounded-brand object-contain bg-white border border-ink-softLine p-1" />
          ) : (
            <div className="w-16 h-16 rounded-brand flex items-center justify-center text-white font-display font-bold text-2xl"
                 style={{ background: palette.primary || brandColor }}>
              {name.charAt(0)}
            </div>
          )}
          <div className="flex-1 min-w-[240px]">
            <label className="label">Org name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>

        {/* Logo lookup */}
        <div>
          <label className="label">Logo from website</label>
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              placeholder="example.com or company name"
              className="input flex-1 min-w-[200px]"
              value={logoQuery}
              onChange={(e) => setLogoQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); searchLogo(); } }}
            />
            <button type="button" onClick={searchLogo} disabled={logoLooking} className="btn-secondary text-sm whitespace-nowrap">
              {logoLooking ? "Searching…" : "🔍 Search"}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
            <button type="button" className="btn-ghost text-sm whitespace-nowrap" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? "Uploading…" : "Upload file"}
            </button>
          </div>
          {logoLookupMsg && (
            <div className={`text-xs mt-1.5 ${logoLookupMsg.kind === "ok" ? "text-brand-emerald" : "text-brand-red"}`}>
              {logoLookupMsg.text}
            </div>
          )}
          <div className="meta mt-1.5">
            We'll search the web for the official logo. URL or company name both work.
          </div>
        </div>

        <div>
          <label className="label">Or paste a direct logo URL</label>
          <input
            type="text"
            className="input"
            placeholder="/api/files/raw?path=… or https://…"
            value={brandLogoUrl}
            onChange={(e) => setBrandLogoUrl(e.target.value)}
          />
        </div>
      </section>
      )}

      {/* Brand palette */}
      {show("branding") && (
      <section className="card p-5 space-y-3">
        <div>
          <div className="eyebrow">Brand palette</div>
          <p className="text-sm text-ink-muted mt-0.5">
            Edit the full palette. Primary anchors most UI surfaces. Accent is for CTAs.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(Object.keys(PALETTE_DEFAULTS) as Array<keyof BrandPalette>).map((key) => (
            <PaletteRow
              key={key}
              label={key}
              value={palette[key] || PALETTE_DEFAULTS[key]}
              onChange={(v) => setPaletteColor(key, v)}
              fallback={PALETTE_DEFAULTS[key]}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={() => setPalette({ ...PALETTE_DEFAULTS })}
            className="btn-ghost text-xs"
          >
            ↺ Reset to platform defaults
          </button>
          <PaletteSwatches palette={palette} />
        </div>
      </section>
      )}

      {/* Sales prefs */}
      {show("preferences") && (
      <section className="card p-5 space-y-3">
        <div className="eyebrow">Sales preferences</div>
        <div>
          <label className="label">Sales methodology</label>
          <input className="input" placeholder="MEDDPICC, Sandler, BANT…" value={salesMethodology} onChange={(e) => setSalesMethodology(e.target.value)} />
        </div>
        <div>
          <label className="label">Org values (one per line)</label>
          <textarea className="input min-h-[100px]" value={valuesText} onChange={(e) => setValuesText(e.target.value)} />
        </div>
        {/* v3.37 — Self-coach button label. Each org can rebrand the action. */}
        <div>
          <label className="label">"Improve" button label</label>
          <input
            className="input"
            placeholder="Improve"
            maxLength={40}
            value={improveButtonLabel}
            onChange={(e) => setImproveButtonLabel(e.target.value)}
          />
          <div className="meta mt-1">
            What your team sees on their dashboard CTA. Examples: "Improve", "Get Better", "Level Up", "Sharpen". Leave blank to use the default ("Improve").
          </div>
        </div>
      </section>
      )}

      {/* Required skills */}
      {show("preferences") && (
      <section className="card p-5 space-y-3">
        <div className="eyebrow">Required skills</div>
        <p className="text-sm text-ink-muted">Weight 0 = ignore, 10 = top priority. Add custom skills if you track competencies beyond the defaults.</p>
        <ul className="space-y-2">
          {skills.map((s, i) => (
            <li key={`${s.category}-${i}`} className="flex items-center gap-3 flex-wrap">
              <span className={`text-sm ${s.custom ? "font-mono" : "font-semibold"} w-48`}>
                {s.category.replace(/_/g, " ")}{s.custom && <span className="badge-active text-[9px] ml-2">custom</span>}
              </span>
              <input type="range" min={0} max={10} step={0.5} value={s.weight}
                onChange={(e) => setWeight(i, Number(e.target.value))} className="flex-1 min-w-[100px]" />
              <span className="font-mono text-sm w-12 text-right">{s.weight.toFixed(1)}</span>
              {s.custom && <button onClick={() => removeSkill(i)} className="text-brand-red text-xs px-2">remove</button>}
            </li>
          ))}
        </ul>
        <div className="flex gap-2 pt-2">
          <input className="input flex-1" placeholder="Add custom skill (Forecasting, Account Planning…)"
            value={newSkillName} onChange={(e) => setNewSkillName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomSkill())} />
          <button onClick={addCustomSkill} disabled={!newSkillName.trim()} className="btn-secondary text-sm">+ Add</button>
        </div>
      </section>
      )}

      {/* SMTP — per-org email config */}
      {show("technical") && (
      <section className="card p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="eyebrow">Email (SMTP)</div>
            <p className="text-sm text-ink-muted mt-0.5">
              Configure your own outbound mail server so welcome and reset emails come from your domain.
              If left blank, falls back to the Sales Coach AI platform default → server env → console log.
            </p>
          </div>
          <button onClick={testSmtp} disabled={testing} className="btn-secondary text-sm whitespace-nowrap">
            {testing ? "Testing…" : "Send test email"}
          </button>
        </div>

        <div className="border border-brand-indigo/15 bg-brand-indigo/5 rounded-brand p-3 text-xs space-y-1">
          <div className="font-semibold text-brand-indigo">Setup walkthroughs:</div>
          <div className="flex flex-wrap gap-3">
            <a href="/help?topic=smtp-resend" className="link">Resend</a>
            <a href="/help?topic=smtp-postmark" className="link">Postmark</a>
            <a href="/help?topic=smtp-ses" className="link">Amazon SES</a>
            <a href="/help?topic=smtp-gmail" className="link">Gmail / Google Workspace</a>
            <a href="/help?q=smtp" className="link">All email articles →</a>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="label">SMTP host</label>
            <input className="input font-mono" placeholder="smtp.resend.com" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
            <div className="meta mt-1">Common: smtp.resend.com (Resend), smtp.postmarkapp.com (Postmark), email-smtp.us-east-1.amazonaws.com (SES).</div>
          </div>
          <div>
            <label className="label">Port</label>
            <input type="number" className="input font-mono" value={smtpPort}
              onChange={(e) => setSmtpPort(Number(e.target.value) || 587)} />
            <div className="meta mt-1">587 (STARTTLS) or 465 (SSL).</div>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm font-semibold text-ink-slate">
              <input type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} />
              Use SSL/TLS (port 465)
            </label>
          </div>
          <div>
            <label className="label">SMTP username</label>
            <input className="input font-mono" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} />
          </div>
          <div>
            <label className="label">SMTP password / API key</label>
            <input
              type="password"
              className="input font-mono"
              placeholder={smtpPassSet ? "•••••••• (leave blank to keep)" : ""}
              value={smtpPass}
              onChange={(e) => setSmtpPass(e.target.value)}
              autoComplete="new-password"
            />
            {smtpPassSet && !smtpPass && <div className="meta mt-1">Stored. Type a new value to replace, or leave blank to keep.</div>}
          </div>
          <div className="sm:col-span-2">
            <label className="label">From address</label>
            <input className="input" placeholder='Sales Coach <noreply@yourcompany.com>' value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} />
          </div>
        </div>

        {smtpTestMsg && (
          <div className={`text-sm rounded-brand px-3 py-2 border ${smtpTestMsg.kind === "ok" ? "text-brand-emerald bg-brand-emerald/5 border-brand-emerald/20" : "text-brand-red bg-brand-red/5 border-brand-red/20"}`}>
            {smtpTestMsg.text}
          </div>
        )}
      </section>
      )}

      {/* Cost / usage estimate */}
      {show("technical") && (
      <section className="card p-5">
        <div className="eyebrow mb-2">AI usage estimate</div>
        <p className="text-sm text-ink-muted mb-3">
          Rough monthly Grok cost. Cleanup ops always run on the cheap tier; synthesis follows the model selected above.
        </p>
        <ul className="text-sm space-y-1.5">
          <li className="flex justify-between"><span>Intake synthesis (per AE, one-time)</span><span className="font-mono">~$0.01–$0.05</span></li>
          <li className="flex justify-between"><span>Director coaching cross-ref (per prep doc)</span><span className="font-mono">~$0.01–$0.03</span></li>
          <li className="flex justify-between"><span>Knowledge article extraction (per file/URL)</span><span className="font-mono">~$0.005</span></li>
          <li className="flex justify-between"><span>MC option enhance (per click)</span><span className="font-mono">~$0.0005</span></li>
          <li className="flex justify-between"><span>Task generation (per AE, per cycle)</span><span className="font-mono">~$0.005</span></li>
          <li className="flex justify-between"><span>Monthly review summary (per AE/month)</span><span className="font-mono">~$0.01–$0.02</span></li>
        </ul>
        <div className="mt-3 pt-3 border-t border-ink-softLine text-sm">
          <strong>Typical 10-AE team / month:</strong>{" "}
          <span className="font-mono">≈ $2–10</span>
          <span className="meta"> · grok-4.3 high-reasoning pushes this 2–4x higher</span>
        </div>
      </section>
      )}

      {msg && (
        <div className={`text-sm rounded-brand px-3 py-2 border ${msg.kind === "ok" ? "text-brand-emerald bg-brand-emerald/5 border-brand-emerald/20" : "text-brand-red bg-brand-red/5 border-brand-red/20"}`}>
          {msg.text}
        </div>
      )}

      <div className="flex gap-2 sticky bottom-2 bg-white/95 backdrop-blur p-2 rounded-brand border border-ink-softLine shadow-card">
        <button onClick={save} disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save changes"}</button>
        <button onClick={() => router.push("/admin/orgs")} className="btn-ghost">Cancel</button>
      </div>
    </div>
  );
}

function PaletteRow({
  label, value, onChange, fallback,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  fallback: string;
}) {
  const isHex = /^#[0-9a-fA-F]{6}$/.test(value);
  const safe = isHex ? value : fallback;
  return (
    <div>
      <label className="label capitalize">{label}</label>
      <div className="flex gap-2">
        <input
          type="color"
          className="w-10 h-10 rounded-brand border border-ink-line"
          value={safe}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          className="input font-mono text-sm flex-1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={fallback}
        />
      </div>
    </div>
  );
}

function PaletteSwatches({ palette }: { palette: BrandPalette }) {
  return (
    <div className="flex gap-1">
      {(["primary", "secondary", "accent", "neutral", "success", "warning", "danger"] as const).map((k) => (
        <span
          key={k}
          className="w-5 h-5 rounded border border-ink-softLine"
          style={{ background: palette[k] || PALETTE_DEFAULTS[k] }}
          title={`${k}: ${palette[k]}`}
        />
      ))}
    </div>
  );
}
