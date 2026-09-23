"use client";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password.");
      return;
    }
    router.push(from);
    router.refresh();
  }

  return (
    <div className="card w-full max-w-md p-8 animate-slideUp">
      <div className="flex items-center gap-3 mb-6">
        <svg width="48" height="48" viewBox="0 0 64 64" className="rounded-brand shadow-orangeGlow" role="img" aria-label="Sales Coach AI">
          <defs>
            <linearGradient id="lgnbg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
              <stop stopColor="#0B1F3A" />
              <stop offset="1" stopColor="#1F3C88" />
            </linearGradient>
            <linearGradient id="lgnbolt" x1="20" y1="14" x2="44" y2="50" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FF6A1A" />
              <stop offset="1" stopColor="#F59E0B" />
            </linearGradient>
          </defs>
          <rect width="64" height="64" rx="14" fill="url(#lgnbg)" />
          <rect x="14" y="38" width="6" height="14" rx="2" fill="#1F3C88" opacity="0.55" />
          <rect x="24" y="30" width="6" height="22" rx="2" fill="#1F3C88" opacity="0.75" />
          <rect x="34" y="22" width="6" height="30" rx="2" fill="#1F3C88" opacity="0.95" />
          <path d="M44 14 L34 32 L41 32 L36 50 L52 28 L45 28 Z" fill="url(#lgnbolt)" />
        </svg>
        <h1 className="h-section">Sales Coach <span className="text-brand-orange">AI</span></h1>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" required className="input" autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" required className="input" autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && (
          <div className="text-sm text-brand-red bg-brand-red/5 border border-brand-red/20 rounded-brand px-3 py-2">
            {error}
          </div>
        )}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-surface-app via-white to-surface-app">
      <Suspense fallback={<div className="card p-8">Loading…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
