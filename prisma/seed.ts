/**
 * Demo seed (v3.29) — platform org + two customer orgs.
 *
 * Orgs:
 *   - Ben Johnson AI       (slug: benjohnson-ai)    PLATFORM ONLY. No AEs, no customer profile.
 *   - Euna Solutions Inc.  (slug: euna-solutions)   Customer org #1 (3 directors, 6 AEs + demo).
 *   - Ministry Brands      (slug: ministry-brands)  Customer org #2 (2 directors, 4 AEs).
 *
 * Every customer org has a Company Admin (enforced here).
 *
 * Logins (all `changeme` initially — change immediately in production):
 *   ben@benjohnson.ai                        ORG_ADMIN     (platform)
 *   sarah@eunasolutions.example.com          COMPANY_ADMIN (Euna)
 *   mike@eunasolutions.example.com           VP_SALES      (Euna)
 *   alex@eunasolutions.example.com           DIRECTOR      (Euna, reports to Mike)
 *   ae-demo@eunasolutions.example.com        AE            (Euna, reports to Alex)
 *   diane@ministrybrands.example.com         COMPANY_ADMIN (Ministry)
 *   reggie@ministrybrands.example.com        VP_SALES      (Ministry)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { buildSeedQuestions, QUESTION_COUNTS } from "./seed-questions";
import { seedPersonas, getCanonicalPersonaEmailMap } from "./seed-personas";

// Canonical org slugs after v3.29. Anything else is leftover from an earlier
// seed iteration and gets handled by the enforcement pass below.
const CANONICAL_SLUGS = new Set(["benjohnson-ai", "euna-solutions", "ministry-brands"]);

const prisma = new PrismaClient();

const RESET_QUESTIONS = process.env.SEED_RESET_QUESTIONS === "true";
const SEED_PERSONAS = process.env.SEED_PERSONAS !== "false"; // on by default

async function main() {
  console.log("Seeding v3.29 (platform + two customer orgs: Euna Solutions, Ministry Brands)…");

  const passwordHash = await bcrypt.hash("changeme", 12);

  // ============================================================
  // ONE-SHOT LEGACY MIGRATION (idempotent)
  //   v3.29 replaces the single "Acme Sales" customer org with
  //   "Euna Solutions Inc." + "Ministry Brands". For dev DBs that
  //   were seeded under v3.28 or earlier, rename Acme → Euna
  //   (preserving all FK relationships), swap @acme.example.com
  //   email TLDs, and move Ministry-bound personas to the new
  //   Ministry org. Skips silently if the legacy org isn't there.
  // ============================================================
  const legacyAcme = await prisma.org.findUnique({ where: { slug: "acme" } });
  if (legacyAcme) {
    console.log("  Legacy 'acme' org detected — migrating to Euna Solutions / Ministry Brands…");

    // Step 1: rename legacy org to Euna Solutions (preserves all FKs)
    await prisma.org.update({
      where: { id: legacyAcme.id },
      data: { name: "Euna Solutions Inc.", slug: "euna-solutions", brandColor: "#1F3C88" },
    });

    // Step 2: rewrite @acme.example.com emails to @eunasolutions.example.com.
    // Most personas stay in Euna; Ministry-bound personas get re-domained below.
    const usersWithLegacyEmail = await prisma.user.findMany({
      where: { email: { endsWith: "@acme.example.com" } },
      select: { id: true, email: true },
    });
    for (const u of usersWithLegacyEmail) {
      const newEmail = u.email.replace(/@acme\.example\.com$/, "@eunasolutions.example.com");
      // Only update if the destination email isn't already taken
      const exists = await prisma.user.findUnique({ where: { email: newEmail } });
      if (!exists) {
        await prisma.user.update({ where: { id: u.id }, data: { email: newEmail } });
      }
    }

    // Step 3: rewrite Ministry-bound personas' email domains
    const ministryEmailMap: Record<string, string> = {
      "priya@eunasolutions.example.com":          "priya@ministrybrands.example.com",
      "jordan@eunasolutions.example.com":         "jordan@ministrybrands.example.com",
      "ae-achiever@eunasolutions.example.com":    "ae-achiever@ministrybrands.example.com",
      "ae-individualist@eunasolutions.example.com": "ae-individualist@ministrybrands.example.com",
      "ae-loyalist-new@eunasolutions.example.com": "ae-loyalist-new@ministrybrands.example.com",
      "ae-peacemaker@eunasolutions.example.com":  "ae-peacemaker@ministrybrands.example.com",
    };
    for (const [oldEmail, newEmail] of Object.entries(ministryEmailMap)) {
      const u = await prisma.user.findUnique({ where: { email: oldEmail } });
      if (!u) continue;
      const taken = await prisma.user.findUnique({ where: { email: newEmail } });
      if (taken) continue;
      await prisma.user.update({ where: { id: u.id }, data: { email: newEmail } });
    }
  }

  // --- Orgs ---
  // The seed never renames orgs. It looks for an existing match by slug OR
  // by name (case-insensitive contains). Only creates a new org if no match
  // exists. This means if you renamed "Euna Solutions Inc." → "Euna Solutions"
  // in the UI, the next seed run finds and uses the renamed org instead of
  // creating a duplicate.
  async function findOrCreateOrg(opts: {
    canonicalSlug: string;
    nameMatchers: string[];   // case-insensitive substrings — first match wins
    fallbackName: string;
    fallbackBrandColor: string;
  }) {
    // Strategy: name match first. If the user named an org "Euna Solutions",
    // use THAT — even if there's also a stale slug match like "Euna Solutions Inc.".
    // Slug match is the fallback. New creation is the last resort.
    for (const matcher of opts.nameMatchers) {
      const matches = await prisma.org.findMany({
        where: { name: { contains: matcher, mode: "insensitive" } },
        orderBy: { updatedAt: "desc" }, // prefer the org the admin most recently touched
      });
      if (matches.length > 1) {
        console.warn(`  ⚠ ${matches.length} orgs match "${matcher}" — using the most recently updated:`);
        for (const m of matches) console.warn(`     - "${m.name}" (slug: ${m.slug}, updated: ${m.updatedAt.toISOString().slice(0, 10)})`);
        console.warn(`     Manually merge or rename the duplicates at /admin/orgs.`);
      }
      if (matches.length >= 1) {
        const picked = matches[0];
        console.log(`  Using existing org "${picked.name}" (slug: ${picked.slug})`);
        return picked;
      }
    }

    // Fallback: slug match (covers the case where the org was renamed to
    // something not in our matcher list).
    const bySlug = await prisma.org.findUnique({ where: { slug: opts.canonicalSlug } });
    if (bySlug) {
      console.log(`  Using existing org by slug "${bySlug.slug}" (name: "${bySlug.name}")`);
      return bySlug;
    }

    // No existing org → create with the canonical slug.
    console.log(`  Creating new org "${opts.fallbackName}" (slug: ${opts.canonicalSlug})`);
    return prisma.org.create({
      data: {
        name: opts.fallbackName,
        slug: opts.canonicalSlug,
        brandColor: opts.fallbackBrandColor,
      },
    });
  }

  const benOrg = await findOrCreateOrg({
    canonicalSlug: "benjohnson-ai",
    nameMatchers: ["sales coach", "ben johnson"],
    fallbackName: "Sales Coach AI",
    fallbackBrandColor: "#0B1F3A",
  });

  const eunaOrg = await findOrCreateOrg({
    canonicalSlug: "euna-solutions",
    nameMatchers: ["euna"],
    fallbackName: "Euna Solutions",
    fallbackBrandColor: "#1F3C88",
  });

  const ministryOrg = await findOrCreateOrg({
    canonicalSlug: "ministry-brands",
    nameMatchers: ["ministry"],
    fallbackName: "Ministry Brands",
    fallbackBrandColor: "#2D5F3D",
  });

  // ============================================================
  // LEGACY MIGRATION (continued): now that ministryOrg exists,
  // move Ministry-bound users + their aeProfiles to Ministry org.
  // Idempotent — safe to re-run after first migration.
  // ============================================================
  if (legacyAcme) {
    const ministryEmails = [
      "priya@ministrybrands.example.com",
      "jordan@ministrybrands.example.com",
      "diane@ministrybrands.example.com",
      "reggie@ministrybrands.example.com",
      "ae-achiever@ministrybrands.example.com",
      "ae-individualist@ministrybrands.example.com",
      "ae-loyalist-new@ministrybrands.example.com",
      "ae-peacemaker@ministrybrands.example.com",
    ];
    for (const email of ministryEmails) {
      const u = await prisma.user.findUnique({ where: { email } });
      if (!u || u.orgId === ministryOrg.id) continue;
      await prisma.user.update({ where: { id: u.id }, data: { orgId: ministryOrg.id } });
      // Move their AeProfile too (if any)
      await prisma.aeProfile.updateMany({
        where: { userId: u.id },
        data: { orgId: ministryOrg.id },
      });
      // Move their DirectorProfile too (if any)
      await prisma.directorProfile.updateMany({
        where: { userId: u.id },
        data: { orgId: ministryOrg.id },
      });
    }
    console.log("  Legacy migration complete.");
  }

  // --- Platform CompanyProfile (Ben Johnson AI) ---
  // Holds the platform-default SMTP. No requiredSkills/values — this org has no AEs.
  // Without this row, the SMTP fallback chain in lib/email.ts has nothing to read.
  await prisma.companyProfile.upsert({
    where: { orgId: benOrg.id },
    update: {},
    create: {
      orgId: benOrg.id,
      requiredSkills: [],
      values: [],
      salesMethodology: null,
      intakeConfig: { targetQuestionCount: 0, intercalation: false },
    },
  });

  // --- Customer company profiles (every customer org must have one) ---
  await prisma.companyProfile.upsert({
    where: { orgId: eunaOrg.id },
    update: {},
    create: {
      orgId: eunaOrg.id,
      requiredSkills: [
        { category: "DISCOVERY", weight: 1.0 },
        { category: "OBJECTION_HANDLING", weight: 1.0 },
        { category: "CLOSING", weight: 1.0 },
        { category: "COMMUNICATION", weight: 0.8 },
        { category: "RESILIENCE", weight: 0.7 },
        { category: "PRODUCT_MASTERY", weight: 1.0 },
      ],
      values: ["Customer obsession", "First-principles thinking", "Bias to action"],
      salesMethodology: "MEDDPICC",
      intakeConfig: { targetQuestionCount: 30, intercalation: true },
    },
  });

  await prisma.companyProfile.upsert({
    where: { orgId: ministryOrg.id },
    update: {},
    create: {
      orgId: ministryOrg.id,
      requiredSkills: [
        { category: "DISCOVERY", weight: 1.0 },
        { category: "COMMUNICATION", weight: 1.0 },
        { category: "CLOSING", weight: 0.9 },
        { category: "OBJECTION_HANDLING", weight: 0.8 },
        { category: "PRODUCT_MASTERY", weight: 0.9 },
        { category: "RESILIENCE", weight: 0.7 },
      ],
      values: ["Servant leadership", "Long-term partnerships", "Mission first"],
      salesMethodology: "Sandler",
      intakeConfig: { targetQuestionCount: 30, intercalation: true },
    },
  });

  // --- Platform admin lookup (NOT created here) ---
  // The seed no longer creates a default super admin. The real super admin
  // (Ben Johnson, or whoever the platform owner is) lives in the platform org
  // already. We just look them up so we can attribute `invitedBy` on the
  // demo personas. If no super admin exists yet, that's fine — invitedBy
  // stays null and the seed prints a warning.
  const platformAdmin = await prisma.user.findFirst({
    where: { orgId: benOrg.id, role: "ORG_ADMIN" },
    select: { id: true, email: true, name: true },
  });
  if (!platformAdmin) {
    console.warn(`  ⚠ Platform org "${benOrg.name}" has no Super Admin user.`);
    console.warn(`     Demo personas will be created with invitedBy = null.`);
    console.warn(`     Add yourself manually before going live: insert a user with role=ORG_ADMIN and orgId="${benOrg.id}".`);
  } else {
    console.log(`  Platform admin: ${platformAdmin.name} <${platformAdmin.email}> (id: ${platformAdmin.id})`);
  }
  const platformAdminId: string | null = platformAdmin?.id ?? null;

  // --- Euna Solutions hierarchy: Sarah (CompAdmin) → Mike (VP) → Alex (Dir) → Demo AE ---
  const sarah = await prisma.user.upsert({
    where: { email: "sarah@eunasolutions.example.com" },
    update: { role: "COMPANY_ADMIN", orgId: eunaOrg.id },
    create: {
      email: "sarah@eunasolutions.example.com",
      name: "Sarah Chen",
      role: "COMPANY_ADMIN",
      orgId: eunaOrg.id,
      passwordHash,
      passwordSetAt: new Date(),
      status: "ACTIVE",
      invitedById: platformAdminId,
      invitedAt: new Date(),
    },
  });

  const mike = await prisma.user.upsert({
    where: { email: "mike@eunasolutions.example.com" },
    update: { role: "VP_SALES", orgId: eunaOrg.id },
    create: {
      email: "mike@eunasolutions.example.com",
      name: "Mike Reeves",
      role: "VP_SALES",
      orgId: eunaOrg.id,
      passwordHash,
      passwordSetAt: new Date(),
      status: "ACTIVE",
      invitedById: sarah.id,
      invitedAt: new Date(),
    },
  });

  const alex = await prisma.user.upsert({
    where: { email: "alex@eunasolutions.example.com" },
    update: { role: "DIRECTOR", vpId: mike.id, orgId: eunaOrg.id },
    create: {
      email: "alex@eunasolutions.example.com",
      name: "Alex Director",
      role: "DIRECTOR",
      orgId: eunaOrg.id,
      vpId: mike.id,
      passwordHash,
      passwordSetAt: new Date(),
      status: "ACTIVE",
      invitedById: mike.id,
      invitedAt: new Date(),
    },
  });

  const aeUser = await prisma.user.upsert({
    where: { email: "ae-demo@eunasolutions.example.com" },
    update: { role: "AE", orgId: eunaOrg.id },
    create: {
      email: "ae-demo@eunasolutions.example.com",
      name: "Demo AE",
      role: "AE",
      orgId: eunaOrg.id,
      passwordHash,
      passwordSetAt: new Date(),
      status: "ACTIVE",
      invitedById: alex.id,
      invitedAt: new Date(),
    },
  });

  await prisma.aeProfile.upsert({
    where: { userId: aeUser.id },
    update: { directorId: alex.id, orgId: eunaOrg.id },
    create: { userId: aeUser.id, orgId: eunaOrg.id, directorId: alex.id },
  });

  // --- Ministry Brands hierarchy: Diane (CompAdmin) → Reggie (VP). Directors come from persona seed. ---
  const diane = await prisma.user.upsert({
    where: { email: "diane@ministrybrands.example.com" },
    update: { role: "COMPANY_ADMIN", orgId: ministryOrg.id },
    create: {
      email: "diane@ministrybrands.example.com",
      name: "Diane Park",
      role: "COMPANY_ADMIN",
      orgId: ministryOrg.id,
      passwordHash,
      passwordSetAt: new Date(),
      status: "ACTIVE",
      invitedById: platformAdminId,
      invitedAt: new Date(),
    },
  });

  const reggie = await prisma.user.upsert({
    where: { email: "reggie@ministrybrands.example.com" },
    update: { role: "VP_SALES", orgId: ministryOrg.id },
    create: {
      email: "reggie@ministrybrands.example.com",
      name: "Reggie Banks",
      role: "VP_SALES",
      orgId: ministryOrg.id,
      passwordHash,
      passwordSetAt: new Date(),
      status: "ACTIVE",
      invitedById: diane.id,
      invitedAt: new Date(),
    },
  });

  // --- Products: Euna gets Procurement + Grants. Ministry gets a Ministry-flavored product. ---
  const procurement = await prisma.product.upsert({
    where: { orgId_slug: { orgId: eunaOrg.id, slug: "procurement-suite" } },
    update: {},
    create: {
      orgId: eunaOrg.id,
      name: "Euna Procurement Suite",
      slug: "procurement-suite",
      summary: "End-to-end procurement for state and local agencies.",
      audience: "Counties, cities, school districts",
    },
  });
  const grants = await prisma.product.upsert({
    where: { orgId_slug: { orgId: eunaOrg.id, slug: "grants-manager" } },
    update: {},
    create: {
      orgId: eunaOrg.id,
      name: "Euna Grants Manager",
      slug: "grants-manager",
      summary: "Grants application + management platform.",
      audience: "State agencies, nonprofits",
    },
  });

  await prisma.product.upsert({
    where: { orgId_slug: { orgId: ministryOrg.id, slug: "church-engagement" } },
    update: {},
    create: {
      orgId: ministryOrg.id,
      name: "Church Engagement Cloud",
      slug: "church-engagement",
      summary: "Member engagement, giving, and operations for faith-based orgs.",
      audience: "Churches, denominations, ministries",
    },
  });

  // --- Knowledge repositories (Euna) ---
  const repos: Array<{ kind: any; name: string; visibility?: any }> = [
    { kind: "PRODUCT", name: "Product Knowledge" },
    { kind: "SALES_SKILL", name: "Sales Skills" },
    { kind: "PERSONALITY", name: "Personality (Director-Only)", visibility: "DIRECTOR_ONLY" },
    { kind: "LEADERSHIP", name: "Leadership", visibility: "DIRECTOR_ONLY" },
  ];
  const repoMap: Record<string, string> = {};
  for (const r of repos) {
    const repo = await prisma.knowledgeRepository.upsert({
      where: { orgId_name: { orgId: eunaOrg.id, name: r.name } },
      update: {},
      create: {
        orgId: eunaOrg.id,
        kind: r.kind,
        name: r.name,
        visibility: r.visibility ?? "BOTH",
      },
    });
    repoMap[r.kind] = repo.id;
  }

  // --- Sample articles (Euna) ---
  const articles = [
    {
      kind: "PRODUCT",
      productId: procurement.id,
      title: "Procurement Suite — Top 3 Value Props",
      body: "1. Eliminates manual bid evaluation. 2. Cuts cycle time 40%. 3. Audit-ready compliance trail. Use in BANT-Q context when prospect mentions audit findings or staff turnover.",
      tags: ["value-prop", "discovery"],
    },
    {
      kind: "SALES_SKILL",
      skillCategory: "DISCOVERY",
      title: "MEDDPICC Quick Reference",
      body: "Metrics, Economic buyer, Decision criteria, Decision process, Paper process, Identify pain, Champion, Competition. In gov sales: M, EB, and Paper Process matter most. Always confirm Paper Process before proposing.",
      tags: ["meddpicc", "framework"],
    },
    {
      kind: "PERSONALITY",
      title: "AI Personality Synthesis SOP",
      body: `When synthesizing an AE's intake, use this rubric:

DISC: D drives decisions, I builds rapport, S preserves harmony, C demands evidence.
- High-D AE: Coach with clear stakes and autonomy. Lead with bottom line.
- High-I AE: Energy-driven; needs structure to convert energy to closes.
- High-S AE: Loyal, methodical; coach by celebrating consistency.
- High-C AE: Data-driven; coach with frameworks and metrics.

Enneagram tells you what they fear and what motivates them under pressure.
- Type 3 (Achiever): Coach away from optics-only wins. Tie metrics to client outcomes.
- Type 6 (Loyalist): Over-prepares; needs permission to act on incomplete info.
- Type 8 (Challenger): Direct; coach by debating, not soothing.

MBTI is a lighter signal — useful for communication preferences.

Output should be honest. Score conservatively for new AEs (40-65 range).`,
      tags: ["sop", "synthesis", "rubric"],
    },
    {
      kind: "LEADERSHIP",
      skillCategory: "FORECASTING",
      title: "Forecast Categorization Discipline",
      body: "Commit = >90% confidence with multi-stakeholder verification. Most Likely = 60-90%. Best Case = 30-60%. Re-categorize weekly. Anything sliding two weeks → drop a tier.",
      tags: ["forecasting"],
    },
  ];
  for (const a of articles) {
    await prisma.knowledgeArticle.create({
      data: {
        orgId: eunaOrg.id,
        repositoryId: repoMap[a.kind],
        productId: (a as any).productId ?? null,
        skillCategory: ((a as any).skillCategory as any) ?? null,
        title: a.title,
        body: a.body,
        tagsJson: a.tags as any,
        authorUserId: sarah.id,
        // Demo: pre-approved so they show in the listing without admin action.
        status: "APPROVED",
        approvedByUserId: sarah.id,
        approvedAt: new Date(),
      },
    }).catch(() => null); // tolerate dupes on re-seed
  }

  // ============================================================
  // Bulk question bank — global (orgId: null), shared by every org.
  // Re-run with SEED_RESET_QUESTIONS=true to wipe + reseed.
  // ============================================================
  const bulkQuestions = buildSeedQuestions();
  const existingGlobalCount = await prisma.question.count({ where: { orgId: null } });

  if (RESET_QUESTIONS && existingGlobalCount > 0) {
    console.log(`  Wiping ${existingGlobalCount} existing global questions before reseed…`);
    await prisma.answer.deleteMany({
      where: { question: { orgId: null } },
    });
    await prisma.directorReviewAnswer.deleteMany({
      where: { question: { orgId: null } },
    });
    await prisma.question.deleteMany({ where: { orgId: null } });
  }

  const refreshedCount = await prisma.question.count({ where: { orgId: null } });
  if (refreshedCount === 0) {
    console.log(`  Seeding ${bulkQuestions.length} global questions…`);
    for (const [i, q] of bulkQuestions.entries()) {
      await prisma.question.create({
        data: {
          orgId: null,
          category: q.category as any,
          questionType: q.type as any,
          text: q.text,
          optionsJson: (q.opts as any) ?? null,
          tagsJson: q.tags as any,
          orderHint: i,
          active: true,
        },
      });
    }
    console.log(`  Question bank seeded:`, QUESTION_COUNTS);
  } else {
    console.log(`  Skipping question seed — ${refreshedCount} already present (set SEED_RESET_QUESTIONS=true to reseed).`);
  }

  // Product-knowledge questions (Euna)
  const productQuestions = [
    {
      productId: procurement.id,
      text: "Procurement Suite: which of these is NOT a value prop?",
      type: "MULTIPLE_CHOICE",
      opts: [
        { value: "a", label: "Eliminates manual bid evaluation.", tags: [] },
        { value: "b", label: "40% cycle time reduction.", tags: [] },
        { value: "c", label: "Replaces the agency's CRM.", tags: ["PRODUCT_MASTERY:-10"] },
        { value: "d", label: "Audit-ready compliance trail.", tags: [] },
      ],
    },
    { productId: procurement.id, text: "What's the right opening question for a county procurement officer?", type: "LONG_FORM" },
    { productId: grants.id, text: "Grants Manager: name two prospect personas and their main pain.", type: "LONG_FORM" },
  ];
  const productQCount = await prisma.question.count({ where: { orgId: eunaOrg.id, category: "PRODUCT_KNOWLEDGE" } });
  if (productQCount === 0) {
    for (const [i, q] of productQuestions.entries()) {
      await prisma.question.create({
        data: {
          orgId: eunaOrg.id,
          productId: q.productId,
          category: "PRODUCT_KNOWLEDGE",
          questionType: q.type as any,
          text: q.text,
          optionsJson: (q as any).opts ?? null,
          tagsJson: ["PRODUCT_MASTERY"] as any,
          orderHint: i,
          active: true,
        },
      });
    }
  }

  // ============================================================
  // CANONICAL ORG ENFORCEMENT (idempotent)
  //   Every seeded persona MUST live in either Euna or Ministry. If a previous
  //   seed iteration (or a manual move) parked them in a different org, force
  //   them back into the canonical home before running seedPersonas. This
  //   prevents the org pickers from showing stale orgs that only exist because
  //   they happen to host one of our demo users.
  // ============================================================
  {
    const canonicalMap = getCanonicalPersonaEmailMap();
    const orgIdByKey = { euna: eunaOrg.id, ministry: ministryOrg.id };
    let migrated = 0;

    for (const [email, orgKey] of Object.entries(canonicalMap)) {
      const targetOrgId = orgIdByKey[orgKey as keyof typeof orgIdByKey];
      const u = await prisma.user.findUnique({ where: { email } });
      if (!u) continue;
      if (u.orgId === targetOrgId) continue;

      // Move the user
      await prisma.user.update({ where: { id: u.id }, data: { orgId: targetOrgId } });
      // Cascade their AE profile + Director profile
      await prisma.aeProfile.updateMany({ where: { userId: u.id }, data: { orgId: targetOrgId } });
      await prisma.directorProfile.updateMany({ where: { userId: u.id }, data: { orgId: targetOrgId } });
      migrated++;
    }
    if (migrated > 0) {
      console.log(`  Canonical enforcement: migrated ${migrated} stray persona(s) into Euna/Ministry.`);
    }

    // Platform-org integrity check:
    //   The platform org should only ever contain Super Admin users. If we
    //   find non-admin users here, we WARN but do not auto-move them — the
    //   admin decides where they actually belong (their real customer org)
    //   and moves them via /admin/users/[id]/edit. Auto-routing them to
    //   Euna would silently mis-attribute customer data.
    const strayInPlatform = await prisma.user.findMany({
      where: { orgId: benOrg.id, role: { not: "ORG_ADMIN" } },
      select: { email: true, name: true, role: true },
    });
    if (strayInPlatform.length > 0) {
      console.warn(`  ⚠ ${strayInPlatform.length} non-admin user(s) detected in platform org "${benOrg.name}":`);
      for (const u of strayInPlatform) {
        console.warn(`     - ${u.name} <${u.email}> (${u.role})`);
      }
      console.warn(`     These users should be moved to a customer org via /admin/users/[id]/edit.`);
      console.warn(`     The seed will not auto-move them to avoid silently mis-attributing customer data.`);
    }

    // Sweep: any non-canonical org that still has no users gets soft-marked
    // INACTIVE so it stops appearing in the pickers. We never delete data —
    // the admin can review at /admin/orgs and decide manually.
    // Canonical = platform org (whatever its slug is, identified by ID) +
    // the two seeded customer orgs. This means renaming the platform org's
    // slug doesn't break this sweep.
    const nonCanonical = await prisma.org.findMany({
      where: {
        id: { notIn: [benOrg.id, eunaOrg.id, ministryOrg.id] },
      },
      include: { _count: { select: { users: true } } },
    });
    let deactivated = 0;
    for (const o of nonCanonical) {
      if (o._count.users === 0 && (o as any).status === "ACTIVE") {
        await prisma.org.update({
          where: { id: o.id },
          data: { status: "INACTIVE" as any },
        });
        deactivated++;
      }
    }
    if (deactivated > 0) {
      console.log(`  Canonical enforcement: marked ${deactivated} empty non-canonical org(s) INACTIVE.`);
    }

    // Warn loudly about non-canonical orgs that still have users — those need
    // human review (they may be real customers added via the UI, or they may
    // be old test orgs the admin wants to clean up).
    const nonCanonicalWithUsers = nonCanonical.filter((o: any) => o._count.users > 0);
    if (nonCanonicalWithUsers.length > 0) {
      console.warn(`  ⚠ ${nonCanonicalWithUsers.length} non-canonical org(s) have users — review at /admin/orgs:`);
      for (const o of nonCanonicalWithUsers) {
        console.warn(`     - ${o.name} (slug: ${o.slug}, users: ${o._count.users}, status: ${(o as any).status})`);
      }
    }
  }

  // ============================================================
  // Demo personas — split between Euna and Ministry
  //   Euna:     Alex (existing), Tasha, Marcus  + 6 AEs
  //   Ministry: Priya, Jordan                    + 4 AEs
  // ============================================================
  if (SEED_PERSONAS) {
    console.log("  Seeding demo personas (5 directors + 10 AEs across two customer orgs)…");
    const result = await seedPersonas(prisma, {
      eunaOrgId: eunaOrg.id,
      ministryOrgId: ministryOrg.id,
      eunaVpId: mike.id,
      ministryVpId: reggie.id,
      existingDirectorEmail: "alex@eunasolutions.example.com",
    });
    console.log(`  Personas seeded: ${result.aeCount} AEs, ${result.directorCount} new directors.`);
  } else {
    console.log("  Skipping persona seed (SEED_PERSONAS=false).");
  }

  // Pending monthly review (Euna demo AE under Alex)
  const aeProfile = await prisma.aeProfile.findUnique({ where: { userId: aeUser.id } });
  if (aeProfile) {
    const monthOf = new Date();
    monthOf.setDate(1);
    monthOf.setHours(0, 0, 0, 0);
    await prisma.directorReview.upsert({
      where: { directorId_aeProfileId_monthOf: { directorId: alex.id, aeProfileId: aeProfile.id, monthOf } },
      update: {},
      create: {
        directorId: alex.id,
        aeProfileId: aeProfile.id,
        monthOf,
        status: "PENDING",
        dueAt: new Date(monthOf.getTime() + 30 * 24 * 3600 * 1000),
      },
    });
  }

  const finalQuestionCount = await prisma.question.count();
  const eunaAeCount = await prisma.aeProfile.count({ where: { orgId: eunaOrg.id } });
  const ministryAeCount = await prisma.aeProfile.count({ where: { orgId: ministryOrg.id } });
  const eunaDirectorCount = await prisma.user.count({ where: { orgId: eunaOrg.id, role: "DIRECTOR" } });
  const ministryDirectorCount = await prisma.user.count({ where: { orgId: ministryOrg.id, role: "DIRECTOR" } });
  const platformAeCount = await prisma.aeProfile.count({ where: { orgId: benOrg.id } });

  if (platformAeCount > 0) {
    console.warn(`  ⚠ ${platformAeCount} AE(s) detected under platform org Ben Johnson AI. The platform org should have ZERO AEs.`);
  }

  console.log(`Seed complete (v3.32).

  PLATFORM
    The seed does not create or modify any Super Admin user.
    The platform org "${benOrg.name}" must contain exactly one user (the real
    super admin). The seed will warn if anyone else lands there.
    Current super admin: ${platformAdmin ? platformAdmin.email : "(none — add one manually)"}

  Demo logins (all changeme — change in production):

    EUNA SOLUTIONS INC.
      COMPANY_ADMIN   sarah@eunasolutions.example.com
      VP_SALES        mike@eunasolutions.example.com
      DIRECTOR        alex@eunasolutions.example.com   (existing, synthesized profile)
      DIRECTOR        tasha@eunasolutions.example.com  (Type-3 Achiever, high-D)
      DIRECTOR        marcus@eunasolutions.example.com (Type-5 Investigator, high-C)
      AE              ae-demo@eunasolutions.example.com (existing demo)
      AE              ae-d-driver@eunasolutions.example.com    (Cody Reeves, D/8)
      AE              ae-i-charmer@eunasolutions.example.com   (Maya Lindgren, I/7)
      AE              ae-s-loyalist@eunasolutions.example.com  (Daniel Hargrove, S/6)
      AE              ae-c-analyst@eunasolutions.example.com   (Esther Park, C/5)
      AE              ae-perfectionist@eunasolutions.example.com (Riley Donovan, DC/1)
      AE              ae-helper@eunasolutions.example.com      (Sienna Ortiz, IS/2)

    MINISTRY BRANDS
      COMPANY_ADMIN   diane@ministrybrands.example.com
      VP_SALES        reggie@ministrybrands.example.com
      DIRECTOR        priya@ministrybrands.example.com  (Type-2 Helper, high-I)
      DIRECTOR        jordan@ministrybrands.example.com (Type-9 Peacemaker, high-S)
      AE              ae-achiever@ministrybrands.example.com    (Trent Macready, D/3)
      AE              ae-individualist@ministrybrands.example.com (Naomi Vance, I/4)
      AE              ae-loyalist-new@ministrybrands.example.com (Brooks Tanaka, CS/6)
      AE              ae-peacemaker@ministrybrands.example.com  (Hana Solberg, S/9)

  Org counts:
    Ben Johnson AI    ${platformAeCount} AEs (must be 0)
    Euna Solutions    ${eunaAeCount} AEs · ${eunaDirectorCount} directors
    Ministry Brands   ${ministryAeCount} AEs · ${ministryDirectorCount} directors

  Products:    2 (Euna) + 1 (Ministry)
  Articles:    4 (Euna)
  Questions:   ${finalQuestionCount} total
  Pending DirectorReview: 1 (Alex → Demo AE)

  Re-run with SEED_RESET_QUESTIONS=true to wipe + reseed the global question bank.
  Re-run with SEED_PERSONAS=false to skip the persona seed.
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
