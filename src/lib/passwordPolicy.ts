/**
 * Password policy used by both the set-password client (real-time checklist)
 * and the API (final validation). Single source of truth so the UI never
 * shows "all green" while the server still rejects.
 */

export interface PasswordRule {
  id: string;
  label: string;
  test: (pw: string) => boolean;
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: "length",  label: "At least 10 characters",                       test: (pw) => pw.length >= 10 },
  { id: "upper",   label: "At least one uppercase letter (A–Z)",          test: (pw) => /[A-Z]/.test(pw) },
  { id: "lower",   label: "At least one lowercase letter (a–z)",          test: (pw) => /[a-z]/.test(pw) },
  { id: "number",  label: "At least one number (0–9)",                    test: (pw) => /\d/.test(pw) },
  { id: "symbol",  label: "At least one symbol (e.g., ! @ # $ % ^ & *)",  test: (pw) => /[^A-Za-z0-9]/.test(pw) },
] as const;

export interface PasswordCheckResult {
  ok: boolean;
  failures: string[]; // ids of rules that failed
  message: string;    // first failure label, or "OK"
}

export function checkPassword(pw: string): PasswordCheckResult {
  const failures = PASSWORD_RULES.filter((r) => !r.test(pw)).map((r) => r.id);
  if (failures.length === 0) return { ok: true, failures: [], message: "OK" };
  const first = PASSWORD_RULES.find((r) => r.id === failures[0])!;
  return { ok: false, failures, message: first.label };
}
