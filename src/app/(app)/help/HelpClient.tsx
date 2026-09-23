"use client";
import Link from "next/link";
import { useMemo, useState } from "react";

type Role = "ORG_ADMIN" | "COMPANY_ADMIN" | "VP_SALES" | "DIRECTOR" | "AE";

interface HelpItem {
  id: string;
  title: string;
  body: string;
  roles: Role[];   // who this is relevant for
  tags: string[];
  href?: string;   // optional in-app link
}

const ITEMS: HelpItem[] = [
  // Getting started
  { id: "first-login", title: "I just logged in. What now?",
    body: "If you're an AE, head to your Card and complete the intake. If you're a director or admin, start at the Dashboard — it lists your AEs and any pending reviews. The orange Tasks button (top right) is your action list.",
    roles: ["AE", "DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN"], tags: ["start", "onboarding", "tour"] },
  { id: "what-is-this", title: "What does this app do?",
    body: "It maps each AE's personality, sales style, communication preferences, and skill scores using an AI-driven intake. Directors get a baseball-card-style dashboard for each AE plus AI-generated coaching tasks. Personality content stays director-only by design.",
    roles: ["AE", "DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN"], tags: ["overview", "purpose"] },

  // Intake
  { id: "intake", title: "Completing your intake (AE)",
    body: "The wizard mixes personality, communication, sales-style, and product-knowledge questions in random order — that's intentional. Save and finish later any time; the system remembers where you stopped. After you submit, AI synthesizes your skill card in seconds.",
    roles: ["AE"], tags: ["intake", "wizard", "save", "resume"], href: "/ae/intake" },
  { id: "intake-failed", title: "My intake submission failed",
    body: "Your answers are saved. The wizard auto-retries once. If it still fails, refresh and submit again — the AI service occasionally times out under load.",
    roles: ["AE"], tags: ["intake", "error", "retry"] },

  // Director / VP
  { id: "coaching-loop", title: "How do I run a weekly coaching cycle?",
    body: "Open Reviews → start any pending monthly review, OR click + New Review for an ad-hoc coaching debrief. Drop call notes or prep docs into Files — the AI cross-references them with the AE's profile and surfaces talking points.",
    roles: ["DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN"], tags: ["coaching", "reviews", "files"], href: "/director/reviews" },
  { id: "tasks-ai", title: "How does AI generate tasks?",
    body: "On the Tasks page, click ✨ Generate Tasks. The AI looks at the AE's lowest skill scores, strengths, and weaknesses, then writes 3-5 specific actions with due dates. Personality recommendations are routed to directors only, never the AE.",
    roles: ["DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN", "AE"], tags: ["tasks", "ai", "generate"], href: "/tasks" },

  // Knowledge
  { id: "knowledge-approval", title: "Article approval workflow",
    body: "Anyone with knowledge access can submit an article. It lands in PENDING and shows in the Pending Approval queue at the top of the repo. Super Admins and Company Admins approve or reject. Approved articles appear in the public listing.",
    roles: ["DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN"], tags: ["knowledge", "approval", "moderation"] },
  { id: "knowledge-import", title: "Bulk-importing files into a repo",
    body: "Inside any repo, click 'AI bulk import'. Drop multiple PDFs/DOCXs/HTML files. Each becomes a tagged article + the AI generates a Library Overview that ties them together.",
    roles: ["DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN"], tags: ["knowledge", "ai", "bulk"], href: "/director/knowledge" },
  { id: "knowledge-url", title: "Importing an article from a URL",
    body: "In the article creator, switch to 'From URL' mode. Paste any public blog post or doc URL — the server fetches it, strips HTML, and Grok writes the article entry.",
    roles: ["DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN"], tags: ["knowledge", "url", "ai"] },

  // Products
  { id: "product-synth", title: "Synthesize a product from source files",
    body: "Open any product's detail page. Drop multiple files — datasheets, decks, customer call transcripts. Each becomes a Product Knowledge article. AI generates a master Product Brief covering value props, audience fit, common objections, and a demo flow.",
    roles: ["DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN"], tags: ["product", "ai", "synthesize"], href: "/director/products" },

  // SMTP setup
  { id: "smtp-resend", title: "SMTP setup — Resend",
    body: "1. Sign up at resend.com. 2. Verify your sending domain. 3. Create an API key. 4. In Org settings → SMTP: host=smtp.resend.com, port=587, user=resend, password=YOUR_API_KEY, from=Sales Coach <noreply@yourdomain.com>.",
    roles: ["COMPANY_ADMIN", "ORG_ADMIN"], tags: ["smtp", "email", "resend"] },
  { id: "smtp-postmark", title: "SMTP setup — Postmark",
    body: "1. postmarkapp.com → create a Server. 2. Verify Sender Signature for your from-address. 3. Copy the Server Token. 4. host=smtp.postmarkapp.com, port=587, user=YOUR_TOKEN, password=YOUR_TOKEN (yes, both), from=verified address.",
    roles: ["COMPANY_ADMIN", "ORG_ADMIN"], tags: ["smtp", "email", "postmark"] },
  { id: "smtp-ses", title: "SMTP setup — Amazon SES",
    body: "1. AWS SES Console → verify sending domain (DKIM + SPF). 2. SMTP Settings → Create SMTP credentials (this generates IAM creds in SMTP format). 3. host=email-smtp.us-east-1.amazonaws.com (use your region), port=587, user/password from step 2, from=verified address.",
    roles: ["COMPANY_ADMIN", "ORG_ADMIN"], tags: ["smtp", "email", "aws", "ses"] },
  { id: "smtp-gmail", title: "SMTP setup — Gmail / Google Workspace",
    body: "Use only for low-volume internal use; Gmail rate-limits aggressively. 1. Turn on 2-step verification. 2. Generate an App Password at myaccount.google.com/apppasswords. 3. host=smtp.gmail.com, port=587, user=your@gmail.com, password=APP_PASSWORD, from=your@gmail.com.",
    roles: ["COMPANY_ADMIN", "ORG_ADMIN"], tags: ["smtp", "email", "gmail", "google"] },
  { id: "smtp-test", title: "Testing SMTP",
    body: "After saving SMTP fields, click 'Send test email'. We try a connection-only verify first (catches auth errors fast), then send a test message to your account.",
    roles: ["COMPANY_ADMIN", "ORG_ADMIN"], tags: ["smtp", "test"], href: "/admin/orgs" },

  // Brand
  { id: "brand-ai", title: "Generating brand colors with AI",
    body: "On Org settings, scroll to Brand. Click 'Suggest palettes' — describe your brand or paste your website URL. Grok returns 3 palette options. Pick one, save, done.",
    roles: ["COMPANY_ADMIN", "ORG_ADMIN"], tags: ["brand", "color", "ai"], href: "/admin/orgs" },

  // Roles
  { id: "roles", title: "Role hierarchy",
    body: "Super Admin > Company Admin > VP > Director > AE. Super Admin can do anything across all orgs. Company Admin manages their org. VP manages their reporting tree of directors. Director manages their AEs. AEs see only themselves.",
    roles: ["ORG_ADMIN", "COMPANY_ADMIN"], tags: ["roles", "permissions"] },
  { id: "impersonate", title: "Impersonating another user",
    body: "Super Admin only. Click 'View as' on any non-admin user. An orange banner shows you're impersonating; click 'Exit impersonation' to go back. Every action is audit-logged.",
    roles: ["ORG_ADMIN"], tags: ["impersonate", "admin", "support"], href: "/admin/users" },
  { id: "password-reset", title: "Resetting a user's password",
    body: "Open the user in /admin/users → Edit → Send password reset. Generates a one-time link valid for 1 hour. If SMTP is wired, an email goes out. The link is also displayed inline as a backup.",
    roles: ["ORG_ADMIN", "COMPANY_ADMIN"], tags: ["password", "reset", "user"] },
];

export function HelpClient({ role }: { role: Role }) {
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return ITEMS
      .filter((i) => i.roles.includes(role))
      .filter((i) => {
        if (!q.trim()) return true;
        const hay = (i.title + " " + i.body + " " + i.tags.join(" ")).toLowerCase();
        return hay.includes(q.trim().toLowerCase());
      });
  }, [q, role]);

  return (
    <div className="page max-w-3xl">
      <header className="mb-6">
        <div className="eyebrow mb-2">Help Center</div>
        <h1 className="h-page">How can I help?</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Filtered to your role ({role.replace("_", " ")}). Use search to narrow further.
        </p>
      </header>

      <div className="card p-4 mb-4">
        <input
          autoFocus
          className="input"
          placeholder="Search — try 'tasks', 'smtp', 'intake', 'brand'…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="meta mt-2">{filtered.length} {filtered.length === 1 ? "result" : "results"}</div>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ink-muted">
          No matches. Try a different search.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((item) => {
            const open = openId === item.id;
            return (
              <li key={item.id} className="card overflow-hidden">
                <button
                  onClick={() => setOpenId(open ? null : item.id)}
                  className="w-full text-left px-5 py-3 flex items-center justify-between hover:bg-brand-indigo/5"
                >
                  <span className="font-display font-semibold">{item.title}</span>
                  <span className="text-ink-muted">{open ? "−" : "+"}</span>
                </button>
                {open && (
                  <div className="px-5 py-4 border-t border-ink-softLine animate-fadeIn">
                    <p className="text-sm text-ink-slate whitespace-pre-line leading-relaxed">{item.body}</p>
                    {item.href && (
                      <Link href={item.href} className="link text-sm mt-3 inline-block">
                        Take me there →
                      </Link>
                    )}
                    <div className="meta mt-3">
                      {item.tags.map((t) => (
                        <span key={t} className="badge-neutral text-[10px] mr-1">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
