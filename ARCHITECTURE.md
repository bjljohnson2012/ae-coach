# AE Director Coach — Architecture (v2)

**App identity:** `portal.benjohnson.ai`
**Stack:** Next.js 14 (App Router) + TypeScript + Prisma + PostgreSQL + Tailwind + NextAuth + Grok API (xAI)
**Hosting:** Hostinger VPS via Docker Compose, Caddy for auto-SSL.
**Multi-tenancy:** Single subdomain, single DB. Every multi-tenant table carries `org_id`. Org switcher visible only to `ORG_ADMIN`.

---

## 1. Roles & Permissions

| Role | Scope | Can do |
|---|---|---|
| `ORG_ADMIN` | All orgs | Switch orgs, create orgs, move users between orgs, see everything |
| `DIRECTOR` | Own org + cross-org `DirectorAssignment` orgs | Invite AEs, author questions, manage knowledge repos, run monthly reviews, upload + map files, override skill scores. Has own `DirectorProfile` with leadership scores |
| `AE` | Own org | Save/resume intake wizard, view own skill card, view AE-routed recommendations + visible coaching notes, upload personal files |

`DIRECTOR` access can extend to additional orgs via the `DirectorAssignment` join table — handles the "share with Alex" case without elevating to admin.

---

## 2. Tenancy & Permission Enforcement

Single subdomain (`portal.benjohnson.ai`), single DB. Every tenant-scoped query goes through `src/lib/tenancy.ts`:

- `requireSession()` — throws to /login
- `requireRole(...allowed)` — gates by role
- `assertCanAccessAe(ctx, aeProfileId)` — confirms the actor can touch this AE
- `getAccessibleOrgIds(ctx)` — returns the org_ids this user can read

The org switcher is rendered only for `ORG_ADMIN`. Non-admins have implicit, immutable org context per session.

### Hard server-side rules (NOT just UI)

| Rule | Enforcement point |
|---|---|
| Personality recommendations never reach AEs | `Recommendation.routeTo` filtered to `'AE'` in any AE-facing query (e.g. `/ae/card`) |
| Org transfer admin-only | `/api/admin/move-user` requires `ORG_ADMIN` |
| Wizard category obfuscation | Server intercalates question order; `Question.tagsJson` and `Question.category` never sent to client wizard |
| Directors can only invite AEs (not other directors) | `/api/invite` rejects `role !== 'AE'` from director |
| AE can only edit their own answer set | `/api/intake/save` checks `aSet.aeProfile.userId === ctx.userId` |
| Coaching notes default `visibleToAe = false` | Director must opt-in toggle to expose to AE |

---

## 3. Data Model (high level)

Full schema in `prisma/schema.prisma`. v2 added 9 new models and 5 column updates.

```
Org ──┬── User (role: ORG_ADMIN | DIRECTOR | AE)
      │     ├── InviteToken
      │     ├── AeProfile (1:1 if role=AE)
      │     └── DirectorProfile (1:1 if role=DIRECTOR or ORG_ADMIN)
      ├── CompanyProfile (1:1 with Org)
      ├── Product (1:n) ── KnowledgeArticle (n)
      ├── Question (orgId nullable for global) ──┬── Answer
      │                                           └── DirectorReviewAnswer
      ├── KnowledgeRepository (one per kind: PRODUCT, SALES_SKILL, PERSONALITY, LEADERSHIP)
      │     └── KnowledgeArticle (with optional embedding column for future RAG)
      ├── DirectorAssignment (cross-org director access)
      ├── FileAsset ── FileMapping (1:1 — captures intent at upload)
      └── AuditLog (USER_CREATED, USER_MOVED_ORG, FILE_MAPPED, QUESTION_AI_GENERATED, ...)

AeProfile ──┬── AnswerSet (versioned, IN_PROGRESS supports save/resume)
            │     └── Answer (links to Question)
            ├── SkillScore (six categories: DISCOVERY, OBJECTION_HANDLING, CLOSING, COMMUNICATION, RESILIENCE, PRODUCT_MASTERY)
            ├── SkillScoreHistory (for trend display)
            ├── CoachingNote (director writes; visibleToAe toggle)
            ├── PrepDoc → CrossRefAnalysis (AI talking points)
            ├── Plan (year/quarter focus areas)
            ├── Recommendation (routeTo: AE | DIRECTOR_ONLY, channel: TASK | EMAIL | NOTE)
            ├── Task
            ├── FileAsset (per-AE files)
            ├── DirectorReview (monthly check-in by director)
            └── RecheckCadence (quarterly recheck schedule)

DirectorProfile ──┬── AnswerSet (same model, via directorProfileId)
                  └── DirectorSkillScore (LEADERSHIP, FORECASTING, COMMUNICATION, RESILIENCE)
```

---

## 4. Key Flows

### 4.1 AE invite → save/resume wizard → profile

```
Director opens /director/invite
  → POST /api/invite {email, name}
  → Server: User(PENDING) + AeProfile shell + InviteToken (7-day TTL)
  → Console logs invite link (SMTP unwired in v0)

AE clicks link → /set-password/{token}
  → Activates user, sets password

AE logs in → middleware routes to /ae/intake (or /ae/card if completed)
  → POST /api/intake/start
  → Server: pulls active questions for org + globals
            intercalates by category (round-robin so categories never run consecutively)
            creates AnswerSet(IN_PROGRESS, version, questionOrder=[...ids])
            returns intercalated order + any existing answers + resumeIndex

AE answers questions, can "Save & finish later" any time
  → POST /api/intake/save {answerSetId, questionId, value, resumeIndex}
  → Server: upsert Answer + advance resumeIndex

AE submits final question
  → POST /api/intake/submit {answerSetId}
  → Server: AnswerSet → COMPLETED
            Build Grok payload with hidden category + tagsJson
            synthesizeProfile(answerSet, companyProfile)
            Persist personality/sales/comms summaries + 6 SkillScores + history
            AuditLog: PROFILE_SYNTHESIZED
  → AE redirected to /ae/card
```

### 4.2 Director coaching loop (manual + via uploaded coaching doc)

```
Manual: Director opens /director/ae/[id]
  → Sees skill card + history
  → Can write CoachingNote (toggle visibleToAe)
  → Can override SkillScore via /api/skill-score
       (logged with source=DIRECTOR_OVERRIDE + history row + audit log)

Via file: Director opens /director/files
  → Pastes coaching doc text + filename
  → Click "AI classify" → /api/files/classify
       → Grok returns {kind, aeProfileId, updateIntent, visibility, confidence, rationale}
  → Director confirms / overrides each field
  → Click "Confirm & save" → /api/files
       → Creates FileMapping (with AI suggestion fields for audit)
       → Creates FileAsset
       → If kind=COACHING_DOC + intent=UPDATE_PROFILE + ae set:
           → Calls crossReferencePrepDoc(aeProfile, doc)
           → Creates PrepDoc + CrossRefAnalysis
           → For each rec: creates Recommendation
                 PERSONALITY → routeTo=DIRECTOR_ONLY, channel=NOTE
                 SALES/PRODUCT → routeTo=AE, channel=TASK
       → AuditLog: FILE_UPLOADED + FILE_MAPPED
```

### 4.3 Director monthly review (hybrid cron)

```
Daily cron (post-v0): finds AeProfiles whose director has no review for current month
  → Creates DirectorReview (status=PENDING, dueAt=monthOf+30d)

Director opens /director/reviews
  → Sees pending reviews
  → Opens one → /director/reviews/[id]
  → Answers DIRECTOR_MONTHLY_REVIEW questions
  → Submit → /api/director-review
       → summarizeMonthlyReview(answers, priorScores)
       → Apply scoreDeltas to AE SkillScores (source=MONTHLY_REVIEW + history)
       → Create followUpRecommendations (routing rules apply)
       → DirectorReview → COMPLETED with summary
```

### 4.4 Director intake → leadership profile

```
Director opens /director/profile
  → If no DirectorProfile exists, redirected to /director/intake
  → POST /api/director-intake/start
       → Pulls global + org questions filtered to PERSONALITY + LEADERSHIP + COMMUNICATION + DISC + MBTI + ENNEAGRAM + RESILIENCE
       → Creates DirectorProfile (idempotent) + AnswerSet
       → Returns intercalated order + resume state

Same save/resume mechanics as AE wizard.

On submit → /api/director-intake/submit
  → synthesizeDirectorProfile(answers)
  → Persists personality/leadership/forecasting summaries + DirectorSkillScores (LEADERSHIP, FORECASTING, COMMUNICATION, RESILIENCE)
  → Director redirected back to /director/profile
```

### 4.5 Question authoring (manual + AI-generate)

```
Director opens /director/questions/new
  → Picks category, optionally clicks "Generate 5"
       → POST /api/questions/generate
       → Grok returns 5 draft questions with type, optionsJson (for MC), tagsJson
  → Director clicks "Use →" on a draft to load it into the form
  → Edits text/options/tags as needed
  → Saves → POST /api/questions
       → Question persisted; if AI-generated and edited: originalText preserved
       → AuditLog: QUESTION_CREATED or QUESTION_AI_GENERATED
```

### 4.6 Knowledge library → recommendation pipeline

```
Director opens /director/knowledge → 4 typed repos
  → Creates KnowledgeArticle in any repo
  → Article body fed into Grok as context for future recommendations

When recommendations are generated (cross-ref or monthly review):
  → Server fetches top-k articles via full-text search (Postgres LIKE for now)
  → Passes to Grok with rec routing rules
  → PERSONALITY/LEADERSHIP articles only inform DIRECTOR_ONLY recs

Embedding column reserved on KnowledgeArticle for future pgvector + RAG.
Schema-ready, no migration when you add it.
```

### 4.7 Org transfer (admin)

```
ORG_ADMIN opens /admin/orgs
  → Selects user + target org
  → POST /api/admin/move-user
       → User.orgId updated
       → AeProfile/DirectorProfile.orgId updated
       → AeProfile.directorId nulled (avoid cross-org director references)
       → AuditLog: USER_MOVED_ORG with from/to
```

---

## 5. Module Map

| Module | Path | Responsibility |
|---|---|---|
| Auth | `src/lib/auth.ts`, `src/app/(auth)/*` | NextAuth credentials + JWT, magic-link invite tokens |
| Tenancy guard | `src/lib/tenancy.ts`, `src/middleware.ts` | Role + org_id enforcement |
| Intake wizards | `src/app/(app)/ae/intake/*`, `src/app/(app)/director/intake/*` | AE + Director wizards (save/resume, intercalation) |
| Question authoring | `src/app/(app)/director/questions/*` | Manual + AI-generated CRUD |
| AI service | `src/lib/ai.ts` | All Grok calls (7 functions). Single swap point. |
| Knowledge | `src/app/(app)/director/knowledge/*` | 4 typed repos + article CRUD |
| Coaching loop | `src/app/(app)/director/ae/[id]/*`, `src/app/(app)/director/files/*` | Notes, prep docs, skill score overrides, file mapper |
| Monthly review | `src/app/(app)/director/reviews/*` | Cron-eligible review with score deltas |
| Admin | `src/app/(app)/admin/*` | Org transfer, audit log surfaces |
| Files | `src/lib/files.ts` (v0 stub), local disk for now | Pluggable for S3 in v3 |
| Audit | `prisma.auditLog.create()` calls | Every sensitive write |

---

## 6. Question Intercalation

Algorithm in `src/lib/intercalate.ts`. Round-robin pop with intra-group shuffle:

1. Group questions by `category:productId`
2. Shuffle within each group (so each AE sees a different intra-section order)
3. Pop one per group per round, sorted by remaining-size descending so the largest groups don't all stack at the end
4. Return single ordered list

Result: PERSONALITY question → SALES_STYLE → PRODUCT_KNOWLEDGE:procurement → DISC → COMMUNICATION → PRODUCT_KNOWLEDGE:grants → MBTI → ... never two same-category in a row unless one section dominates.

---

## 7. Recommendation Routing Rules

| Source category | Default `routeTo` | Default `channel` |
|---|---|---|
| `SALES_SKILL` | `AE` | `TASK` (also queues `EMAIL` if AE has email) |
| `PRODUCT_KNOWLEDGE` | `AE` | `TASK` |
| `PERSONALITY` | `DIRECTOR_ONLY` | `NOTE` (appears in director's pre-1:1 brief) |
| `LEADERSHIP` | `DIRECTOR_ONLY` | `NOTE` |
| `HEALTH` | `AE` | `EMAIL` (soft tone) |
| `GENERAL` | `AE` | `NOTE` |

Server enforces. Director can manually re-route case by case.

---

## 8. Knowledge Layer

v2 ships with **structured + Postgres full-text** search. Articles have a nullable `embedding` Json column reserved for v3 vector search via pgvector.

**Article shape:**
- `title`, `body` (markdown)
- Optional `productId` (Product Knowledge repo) or `skillCategory`
- `tagsJson` for ad-hoc tags
- `embedding` + `embeddingModel` (null until backfilled)

**Recommendation pipeline:**
1. Director triggers (cross-ref or monthly review)
2. Server fetches top-k relevant articles by full-text + tag match
3. Articles passed to Grok as context with explicit routing rules
4. `Recommendation` rows created with `sourceArticleIds[]` for attribution

---

## 9. Audit Log

Every sensitive write writes one row in `AuditLog`. Indexed by `(orgId, createdAt)` and `(actorUserId)`. Used for:

- User invites + activations + org moves + role changes
- Profile syntheses (AE + Director)
- Score overrides (DIRECTOR_OVERRIDE)
- File uploads + mappings
- Knowledge article creates
- Question creates (manual or AI-generated)

---

## 10. Deployment (Hostinger VPS)

```
[Caddy :443] ──► [Next.js container :3000]
                       │
                       └──► [Postgres container :5432]
```

- Caddy auto-SSL via Let's Encrypt for `portal.benjohnson.ai`
- Next.js standalone build runs in container
- Postgres in sibling container with named volume
- Env vars in `/etc/ae-coach.env` mounted into the Next.js container
- Deploy = `git pull && docker compose up -d --build` from the VPS

Full step-by-step in `DEPLOY.md`.

---

## 11. v3 Roadmap (deferred but model-ready)

| Feature | What's there | What's left |
|---|---|---|
| Quarterly recheck cron | `RecheckCadence` model | One cron-triggered route to create new AnswerSet |
| pgvector RAG | Nullable `embedding` column | Add pgvector extension, embedding pipeline, swap LIKE to vector search |
| Real binary file uploads | `storagePath` field | Multipart route + S3 SDK (or local disk under `FILES_DIR`) |
| Email delivery | `Recommendation.channel = EMAIL` | Wire nodemailer / Resend |
| Director monthly cron | `DirectorReview` model | Cron route that creates rows monthly |
| Org switcher (admin) | `getAccessibleOrgIds()` exists | Cookie + dropdown + scoped queries |
