"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { PASSWORD_RULES, checkPassword } from "@/lib/passwordPolicy";

export default function SetPasswordPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Live checklist — runs every keystroke. Same library the API uses, so what's
  // green here is what passes server-side.
  const ruleStates = PASSWORD_RULES.map((r) => ({ ...r, passed: r.test(password) }));
  const allRulesPass = ruleStates.every((r) => r.passed);
  const passwordsMatch = password.length > 0 && password === confirm;
  const canSubmit = allRulesPass && passwordsMatch && !loading;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Defensive — the button is disabled when these fail, but in case someone
    // hits Enter, give a precise message.
    const check = checkPassword(password);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    if (password !== confirm) {
      setError("The two password fields don't match. Re-type to confirm.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/set-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: params.token, password, name }),
    });
    if (!res.ok) {
      setLoading(false);
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Could not set password. Please try again.");
      return;
    }
    const j = await res.json();

    // Auto-login: now that the password is set, sign the user in via the
    // credentials provider. NextAuth puts the session cookie, then we navigate
    // to whatever the API said is this role's first stop (intake for AE/Director,
    // dashboard for leaders).
    const signInResult = await signIn("credentials", {
      email: j.email,
      password,
      redirect: false,
    });
    setLoading(false);

    if (signInResult?.error) {
      // Activation succeeded but auto-login failed for some reason. Send them
      // to /login so they can manually authenticate; their password is set.
      setError(null);
      router.push("/login?from=" + encodeURIComponent(j.startUrl || "/dashboard") + "&activated=1");
      return;
    }

    router.push(j.startUrl || "/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-surface-soft">
      <div className="card w-full max-w-md p-8">
        <h1 className="h-section">Welcome aboard.</h1>
        <p className="text-sm text-ink-muted mb-6 mt-1">
          Set your password to activate your account. We'll show requirements as you type.
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="name">Confirm your name (optional)</label>
            <input
              id="name"
              className="input"
              placeholder="Leave blank to keep what your director entered"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label !mb-0" htmlFor="pw">New password</label>
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="text-xs link"
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? "🙈 Hide" : "👁 Show"}
              </button>
            </div>
            <input
              id="pw"
              type={show ? "text" : "password"}
              required
              className="input"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {/* Live checklist — appears as soon as the user starts typing */}
          {password.length > 0 && (
            <ul className="text-xs space-y-1 bg-surface-soft rounded-brand p-3 border border-ink-softLine">
              {ruleStates.map((r) => (
                <li key={r.id} className={r.passed ? "text-brand-emerald" : "text-ink-muted"}>
                  <span aria-hidden="true">{r.passed ? "✓" : "○"}</span>
                  <span className="ml-2">{r.label}</span>
                </li>
              ))}
            </ul>
          )}

          <div>
            <label className="label" htmlFor="pw2">Confirm password</label>
            <input
              id="pw2"
              type={show ? "text" : "password"}
              required
              className="input"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {confirm.length > 0 && !passwordsMatch && (
              <p className="text-xs text-brand-amber mt-1">
                ○ Passwords don't match yet.
              </p>
            )}
            {confirm.length > 0 && passwordsMatch && (
              <p className="text-xs text-brand-emerald mt-1">
                ✓ Passwords match.
              </p>
            )}
          </div>

          {error && (
            <div className="text-sm text-brand-red bg-brand-red/5 border border-brand-red/30 rounded-brand p-3">
              {error}
            </div>
          )}

          <button type="submit" disabled={!canSubmit} className="btn-primary w-full">
            {loading ? "Activating…" : canSubmit ? "Activate account" : allRulesPass ? "Match the passwords to continue" : "Meet the requirements above"}
          </button>
        </form>
      </div>
    </div>
  );
}
