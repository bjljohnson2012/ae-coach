/**
 * Single source of truth for role display labels.
 *
 * The DB enum stays `ORG_ADMIN` (don't migrate the schema for a label change),
 * but everywhere a human reads the role, we say "Super Admin". Same idea as
 * "Lead Engineer" vs an internal `eng_lvl_4` code.
 */

export type RoleCode =
  | "ORG_ADMIN"
  | "COMPANY_ADMIN"
  | "VP_SALES"
  | "DIRECTOR"
  | "AE";

const ROLE_LABELS: Record<RoleCode, string> = {
  ORG_ADMIN:     "Super Admin",
  COMPANY_ADMIN: "Company Admin",
  VP_SALES:      "VP Sales",
  DIRECTOR:      "Director",
  AE:            "AE",
};

/**
 * Convert a role enum value into a display label. Falls back to a humanized
 * version of the raw enum for any role we haven't explicitly mapped.
 */
export function prettyRole(role: string | null | undefined): string {
  if (!role) return "—";
  if (role in ROLE_LABELS) return ROLE_LABELS[role as RoleCode];
  return role.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
