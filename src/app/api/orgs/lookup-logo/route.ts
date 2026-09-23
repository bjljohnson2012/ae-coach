/**
 * POST /api/orgs/lookup-logo
 * Body: { query: string }   // company name OR URL OR domain
 *
 * Resolves a company input to a logo URL. Strategy:
 *   1. Extract a domain from the input (URL → hostname; bare domain → as-is;
 *      free text → ask Grok for the most likely official domain).
 *   2. Build candidate logo URLs:
 *      - https://logo.clearbit.com/<domain>     (PNG, free, no auth)
 *      - https://www.google.com/s2/favicons?domain=<domain>&sz=128  (fallback)
 *   3. HEAD-check Clearbit; if 200 OK return it; else fall back to favicon.
 *
 * Returns: { domain, logoUrl, source: "clearbit" | "favicon" | "none" }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/tenancy";
import { askGrok } from "@/lib/ai";

const Body = z.object({
  query: z.string().min(1).max(500),
});

function extractDomain(input: string): string | null {
  const cleaned = input.trim();
  // Already a URL?
  try {
    const u = new URL(cleaned.startsWith("http") ? cleaned : `https://${cleaned}`);
    const host = u.hostname.replace(/^www\./i, "");
    if (host.includes(".")) return host;
  } catch {
    // not a URL
  }
  // Bare-domain heuristic: contains a dot, no spaces
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(cleaned)) {
    return cleaned.toLowerCase().replace(/^www\./i, "");
  }
  return null;
}

async function resolveDomainViaGrok(name: string): Promise<string | null> {
  try {
    const result = await askGrok(
      `You return the most likely official primary website domain for a company by name.
Output strict JSON only: {"domain": "example.com"} or {"domain": null} if you can't tell.
Use bare hostname — no protocol, no www, no path.`,
      JSON.stringify({ companyName: name }),
      true,
    );
    const parsed = JSON.parse(result);
    const d = (parsed.domain ?? "").toString().toLowerCase().trim();
    if (d && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(d)) return d;
  } catch {
    // ignore
  }
  return null;
}

async function head(url: string, timeoutMs = 4000): Promise<boolean> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeoutMs);
    const r = await fetch(url, { method: "HEAD", signal: c.signal });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  await requireRole("ORG_ADMIN", "COMPANY_ADMIN");
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  let domain = extractDomain(parsed.data.query);
  if (!domain) {
    domain = await resolveDomainViaGrok(parsed.data.query);
  }
  if (!domain) {
    return NextResponse.json({
      error: "Couldn't resolve to a domain. Try entering the URL directly.",
    }, { status: 422 });
  }

  const clearbit = `https://logo.clearbit.com/${domain}`;
  const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

  // Verify Clearbit returns a real logo (404 on misses)
  const ok = await head(clearbit);
  if (ok) {
    return NextResponse.json({ domain, logoUrl: clearbit, source: "clearbit" });
  }

  // Fallback: Google favicon service almost always returns something
  return NextResponse.json({ domain, logoUrl: favicon, source: "favicon" });
}
