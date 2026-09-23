/**
 * Renders a tiny inline <style> that overrides the Tailwind brand color tokens
 * with the active org's palette. Tailwind classes like `bg-brand-indigo` continue
 * to work — they just resolve to the org's primary color instead of the platform default.
 *
 * Approach: each Tailwind brand color is backed by a CSS variable. We set those
 * variables in a per-org <style> tag rendered server-side. No JS, no flash.
 *
 * IMPORTANT: this assumes tailwind config maps the brand colors to var(--brand-*).
 * Currently the config uses literal hex values, so this <style> takes precedence
 * via class-level overrides for the most-used brand classes.
 */

interface BrandPalette {
  primary?: string;
  secondary?: string;
  accent?: string;
  neutral?: string;
  success?: string;
  warning?: string;
  danger?: string;
}

const PLATFORM_DEFAULTS: Required<BrandPalette> = {
  primary:   "#1F3C88",
  secondary: "#0B1F3A",
  accent:    "#FF6A1A",
  neutral:   "#3B4A5A",
  success:   "#0E9F6E",
  warning:   "#F59E0B",
  danger:    "#DC2626",
};

function isHex(s: string | undefined): s is string {
  return !!s && /^#[0-9a-fA-F]{6}$/.test(s);
}

export function BrandTheme({
  palette,
  fallbackPrimary,
}: {
  palette: BrandPalette | null;
  fallbackPrimary: string | null;
}) {
  const merged: Required<BrandPalette> = {
    ...PLATFORM_DEFAULTS,
    ...(palette ?? {}),
    primary: isHex(palette?.primary) ? palette!.primary! : (isHex(fallbackPrimary ?? undefined) ? fallbackPrimary! : PLATFORM_DEFAULTS.primary),
  };

  // Only override if at least one is non-default (avoids extra style on the platform org)
  const isDefault =
    merged.primary === PLATFORM_DEFAULTS.primary &&
    merged.secondary === PLATFORM_DEFAULTS.secondary &&
    merged.accent === PLATFORM_DEFAULTS.accent;

  if (isDefault) return null;

  // Override the most-used brand color classes via descendant attribute selectors.
  // We target Tailwind's generated classes for bg/text/border using primary, accent, etc.
  // Tailwind doesn't expose the CSS variable directly, so we override class rules.
  const css = `
    :root {
      --brand-primary: ${merged.primary};
      --brand-secondary: ${merged.secondary};
      --brand-accent: ${merged.accent};
      --brand-neutral: ${merged.neutral};
      --brand-success: ${merged.success};
      --brand-warning: ${merged.warning};
      --brand-danger: ${merged.danger};
    }
    /* Map utility classes that touch primary brand surfaces to the org's primary. */
    .bg-brand-indigo, .bg-brand-indigoDeep { background-color: var(--brand-primary) !important; }
    .text-brand-indigo, .text-brand-indigoDeep { color: var(--brand-primary) !important; }
    .border-brand-indigo, .border-brand-indigoDeep { border-color: var(--brand-primary) !important; }
    .ring-brand-indigo { --tw-ring-color: var(--brand-primary) !important; }

    .bg-brand-orange { background-color: var(--brand-accent) !important; }
    .text-brand-orange { color: var(--brand-accent) !important; }
    .border-brand-orange { border-color: var(--brand-accent) !important; }
    .ring-brand-orange { --tw-ring-color: var(--brand-accent) !important; }

    .bg-brand-navy { background-color: var(--brand-secondary) !important; }
    .text-brand-navy { color: var(--brand-secondary) !important; }
  `;

  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
