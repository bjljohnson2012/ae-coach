# AE Coach — current state

Recorded 2026-09-23 from the local tree `AE _ Director Coach` and from the live host. This is the inventory of what was built. The migration plan into Field School is a separate document and is not decided here.

Product name in the UI: **Sales Coach AI**. Repo and Compose project name: **ae-coach**. Folder on the VPS: `/opt/ae-coach`.

## Where it runs

| Fact | Value |
|---|---|
| Public URL | `https://portal.benjohnson.ai` |
| VPS | `2.24.70.248` (Hostinger) |
| Edge | Caddy (`docker/Caddyfile`), reverse proxy to the Next.js app on port 3000 |
| Live check | `/` redirects to `/login?from=/`. `/dashboard`, `/ae/card`, and `/director/invite` redirect to login. Login page title is "Sales Coach AI". `POST` shape of NextAuth is present at `/api/auth/csrf`. |
| Compose services | `postgres` (Postgres 16), `app` (Next.js), `cron` (hourly curl sidecar), `caddy` |
| Database | Postgres database `aecoach`, user `aecoach`. Schema is applied with `prisma db push`, not checked-in migrations. |
| Field School on the same machine | Field School joins the external Docker network `ae-coach_default` and reads `/opt/ae-coach/docker/Caddyfile` and `/opt/ae-coach/.env`. `university.benjohnson.ai` 301s to `https://portal.fieldschool.ai/`. |

Secrets stay in `.env` on the machine and on the VPS. They are gitignored. `.env.example` has placeholders only.

The Hostinger API was unauthenticated from this workstation on 2026-09-23, so this record does not include a live container list. The public HTTP checks above are what confirmed the app is answering.

## Stack

- Next.js 14.2 App Router, TypeScript, React 18
- Prisma 5 + PostgreSQL 16
- NextAuth 4 credentials
- Tailwind 3, hand-rolled component classes (not shadcn)
- Grok through the OpenAI-compatible client in `src/lib/ai.ts`
- Nodemailer, Zod, Mammoth, pdf-parse
- Docker Compose + Caddy

`README.md` still describes an early cut and lists tasks, files, plans, and recommendations as deferred. That list is stale. The schema, routes, and screens below are the real app. Inline comments run through the v3.37 line.

## Roles

Enforced in `src/lib/tenancy.ts` and `src/middleware.ts`, not only in the UI.

| Role | What they can do |
|---|---|
| `ORG_ADMIN` | Every org. Org switcher, customer orgs, platform settings, impersonation, analyze. |
| `COMPANY_ADMIN` | One org. Company settings, users in that org. |
| `VP_SALES` | Directors under them (`/vp/team`) plus director tools. |
| `DIRECTOR` | AEs they manage. Invite, coach, questions (if allowed), products, knowledge, files, reviews. Cross-org access is `DirectorAssignment`, not a role upgrade. |
| `AE` | Own intake, skill card, improve drills, knowledge, tasks, quizzes. |

Hard rules already in the code:

- Personality recommendations never go to an AE unless `routeTo` is `AE`.
- Coaching notes default to hidden from the AE.
- Directors invite AEs, not other directors.
- Wizard question order is intercalated on the server so categories are not obvious.
- Org moves are admin-only.

## Logged-in surfaces

Shell: `src/components/AppShell.tsx`. Navy bar, orange Tasks button with a live count, command palette (⌘K), account menu.

Account executives:

- `/ae/card` — skill card
- `/ae/intake` — save-and-resume wizard
- `/improve` — drill runner
- `/knowledge` — articles routed to the AE
- `/tasks` — assigned work
- `/ae/quizzes` — quizzes and retakes

Directors and above:

- `/dashboard` — roster, skill snapshot, intake status, synthesis banner
- `/director/ae/[id]` — the coaching file for one AE
- `/director/profile` and `/director/intake` — the director's own profile
- `/director/questions` — question bank, AI generate / regenerate / dedup
- `/director/products` — product library and synthesis
- `/director/knowledge` — repos and articles
- `/director/files` — upload plus mapping (what the file is for)
- `/director/reviews` — monthly reviews
- `/director/compare` and `/director/compare-directors`
- `/director/invite`
- `/help`

VP and admin:

- `/vp/team`
- `/admin/users`, `/admin/orgs`, `/admin/analyze`, `/admin/email-changes`, `/admin/reports`, `/admin/platform-settings`
- Impersonation banner

Public:

- `/login`, `/set-password/[token]`
- `/quiz/[token]` — a quiz a person can open from a link

Cron, called by the Compose sidecar with `CRON_SECRET`:

- `POST /api/cron/run-quiz-schedules`
- `GET /api/cron/run-weekly-briefs`

The operator stops the AE cron sidecar in the same freeze step as setting `AE_WRITES_FROZEN=1`. That flag returns 503 from non-GET handlers, from the quiz-schedule and weekly-brief cron GETs, and from public quiz submit, and it leaves other GETs, login, and static assets working. The sidecar is a separate Compose process, so leaving it up would keep calling those cron routes after the flag is on.

## Data model

Full schema: `prisma/schema.prisma`. 39 models. There is no `prisma/migrations` history; production sync is `db push` in `docker-compose.yml`.

Tenancy and people: `Org`, `User`, `InviteToken`, `DirectorAssignment`, `CompanyProfile`, `EmailChangeRequest`, `AuditLog`.

Profiles and scores: `AeProfile`, `DirectorProfile`, `Question`, `AnswerSet`, `Answer`, `SkillScore`, `DirectorSkillScore`, `SkillScoreHistory`, `OrgSkillBenchmark`, `OrgSkillBenchmarkFile`.

Coaching loop: `CoachingNote`, `CoachingPlan`, `OneOnOnePrep`, `PrepDoc`, `CrossRefAnalysis`, `Plan`, `Recommendation`, `Task`, `DirectorReview`, `DirectorReviewAnswer`.

Practice: `RecheckCadence`, `QuarterlyPerformance`, `QuizRetakeRequest`, `RecurringQuizSchedule`, `AdHocQuiz`, `UserGameStats`, `GameAttempt`.

Content: `Product`, `KnowledgeRepository`, `KnowledgeArticle`, `FileAsset`, `FileMapping`.

Skill categories on AE profiles: discovery, objection handling, closing, communication, resilience, product mastery. Directors add leadership and forecasting.

Question categories include sales style, communication, personality, Enneagram, DISC, MBTI, motivation, resilience, product knowledge, leadership, and the director monthly review.

## AI

Every model call is supposed to go through `src/lib/ai.ts`. Prompts live in `src/lib/prompts/`.

Jobs that already exist:

- Intake synthesis into a profile and skill scores (async status: generating / ready / failed, with a retry for orphaned submits)
- Coaching-note and coaching-plan help
- Question generation, option enhancement, duplicate check
- File classification and knowledge extraction, including from a URL
- Compare narrative
- Product synthesis
- Task description and task generation
- Weekly brief

Org-level model override exists (`Org.aiModel` in the env example comments). Default synth model is `grok-4-fast-reasoning`. Cheap cleanup uses `grok-3-mini`.

## UI that is worth keeping

This is the interface Ben prefers over the Field School portal. Tokens are in `tailwind.config.ts` and `src/styles/globals.css`.

- Colors: navy `#0B1F3A`, indigo `#1F3C88`, orange `#FF6A1A`, paper background `#F5F7FA`, white cards.
- Type: Inter for text, Space Grotesk for titles, IBM Plex Mono for meta.
- Shape: 14px controls, 20px cards, soft navy shadow, orange glow on the primary action.
- Components, as classes not a kit: `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.card`, `.card-hover`, `.input`, `.badge-*`, `.h-page`, `.eyebrow`.
- Shell patterns: persistent navy nav, role-specific links, Tasks always visible with a count, ⌘K search, avatar menu, synthesis status banner, skill tiles, personality chips, wizard steps, a profile drawer.

Field School's logged-in app (`field-school/app`) is a different system: Next.js 16, Tailwind 4, shadcn, cream paper `#f6f3ec`, Fraunces + IBM Plex, blue `#1f5eff`, a marketing header rather than a coaching shell. Its public training portal is the page at `portal.fieldschool.ai`.

## What Field School already has that this app does not

Do not treat AE Coach as the only system. Field School, in `field-school/app` and `field-school/docs/campus-runtime/`, already has:

- Course ladder: watch a clip, do the station work, clear a quiz (`/c/[courseSlug]`)
- Guest access and a public catalog
- Tenants and stances (learner, teammate, teacher, trainer, coach, leader, guardian, admin)
- First orgs: household and sales, plus the Field School org
- Learning events as the spine (`org_id`, membership, stance, skill ids, score)
- Field Pattern (`fp-50-v1`) and member profiles
- Drizzle schema and SQL migrations, not Prisma
- Auth.js v5, not NextAuth v4
- Billing hooks (Stripe plans and seats)
- A separate marketing site

AE Coach is ahead on coaching workflow, skill cards, director tools, and the app shell. Field School is ahead on courses, tenancy for families as well as sales teams, events, and the newer Next.js stack.

## Docs in this repo

| File | Use it for |
|---|---|
| `ARCHITECTURE.md` | v2 system map. Still the best flow writeup. Roles in that file are behind the schema (it predates `COMPANY_ADMIN` and `VP_SALES`). |
| `DEPLOY.md` | How the VPS was set up. Passwords in that file are placeholders. |
| `prisma/schema.prisma` | The actual data model. |
| `docs/CURRENT_STATE.md` | This file. |
| `docs/FIELD_SCHOOL_MIGRATION.md` | Plan for moving coaching behavior and this shell into Field School. |
