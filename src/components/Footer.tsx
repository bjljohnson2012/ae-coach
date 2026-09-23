import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-ink-softLine mt-12 bg-white">
      <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-orange to-brand-indigo flex items-center justify-center text-white font-display font-bold text-xs">
            SC
          </div>
          <div>
            <div className="font-display font-semibold text-ink leading-tight">Sales Coach AI</div>
            <div className="meta leading-tight font-mono">portal.benjohnson.ai</div>
            <div className="meta leading-tight">© {new Date().getFullYear()} Benjamin Johnson</div>
          </div>
        </div>
        <div className="text-xs text-ink-muted max-w-xl">
          AI-generated insights are advisory only. Coaching recommendations are not a substitute
          for direct manager judgment, HR processes, or performance management policy.
          All personality content is held to director-only visibility by default.
        </div>
        <div className="flex items-center gap-4 text-xs text-ink-muted">
          <Link href="/account" className="link">Account</Link>
        </div>
      </div>
    </footer>
  );
}
