# AE Director Coach

Multi-tenant account-executive profiling, coaching, and skill tracking. The UI calls it Sales Coach AI. Hosted at `portal.benjohnson.ai`.

- `docs/CURRENT_STATE.md` — what is actually built, as of 2026-09-23. Read this first.
- `docs/FIELD_SCHOOL_MIGRATION.md` — plan for moving this product into Field School, including the Sales Coach AI shell.
- `ARCHITECTURE.md` — system map and the main flows. The role table there is older than the schema.
- `DEPLOY.md` — Hostinger VPS setup.
- `prisma/schema.prisma` — the data model.

## Quickstart (local dev)

```bash
# 1. Install
npm install

# 2. Configure env (copy and fill in)
cp .env.example .env
# Edit .env: DATABASE_URL, NEXTAUTH_SECRET, GROK_API_KEY, etc.

# 3. Start Postgres (via Docker)
docker compose up -d postgres

# 4. Migrate DB
npx prisma migrate dev --name init

# 5. Seed (creates a demo Org, you as ORG_ADMIN, sample AE, question bank)
npx prisma db seed

# 6. Run
npm run dev
# → http://localhost:3000
```

Login as the seeded admin: `ben@benjohnson.ai` / `changeme`

## Stack

- **Next.js 14** App Router (TS)
- **Prisma** + **PostgreSQL**
- **NextAuth** credentials provider
- **Grok API** (xAI, OpenAI-compatible) for synthesis & coaching cross-ref
- **Tailwind** + a few hand-rolled card components
- **Caddy** for SSL on the VPS

## Project Structure

```
.
├── ARCHITECTURE.md       # System overview, flows, data model
├── DEPLOY.md             # Hostinger VPS setup
├── prisma/
│   ├── schema.prisma     # Full DB schema (read this first)
│   └── seed.ts           # Demo data + question bank
├── src/
│   ├── middleware.ts     # Auth + role + tenancy guard
│   ├── lib/
│   │   ├── prisma.ts     # Prisma client singleton
│   │   ├── auth.ts       # NextAuth config + helpers
│   │   ├── ai.ts         # Grok client (single source of all AI calls)
│   │   ├── tenancy.ts    # org_id scoping helper
│   │   ├── scoring.ts    # Question tags → SkillScores
│   │   └── prompts/      # Grok system prompts (one per use case)
│   ├── app/
│   │   ├── (auth)/login, set-password
│   │   ├── (app)/dashboard, ae/intake, ae/card, director/ae/[id], director/invite
│   │   └── api/auth, invite, intake/submit, ai/synthesize, coaching-note
│   └── components/
│       ├── SkillCard.tsx
│       ├── WizardStep.tsx
│       └── OrgSwitcher.tsx
├── docker-compose.yml
├── Dockerfile
└── docker/Caddyfile
```

## Roles

- `ORG_ADMIN` — you. Switch orgs, create directors.
- `DIRECTOR` — invites AEs, coaches them, can be cross-org via `DirectorAssignment`.
- `AE` — completes wizard, sees own gamified card.

## End-to-end flow (v0)

1. Login as Director → invite AE.
2. AE gets email link → sets password.
3. AE goes through gamified wizard (~30 seeded questions across hidden categories).
4. Submit triggers Grok synthesis → AE Profile + Skill Scores generated.
5. AE sees skill card on `/ae/card`.
6. Director views AE on `/director/ae/[id]` → adds coaching note, can override scores.

## Status

The "deferred" list that used to live here is out of date. Tasks, files, plans, recommendations, quizzes, knowledge repos, director reviews, and the admin tools all have screens. See `docs/CURRENT_STATE.md`.

---

**Repo conventions**

- Server-first by default. Use Server Components unless you need state/effects.
- Every query that touches tenant-scoped tables MUST go through `requireOrgScope()` from `src/lib/tenancy.ts`.
- All AI calls go through `src/lib/ai.ts`. No direct Grok calls anywhere else.
