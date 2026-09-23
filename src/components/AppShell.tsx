"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import { CommandPalette } from "./CommandPalette";
import { TasksNavBadge } from "./TasksNavBadge";

interface AppShellUser {
  name: string;
  email: string;
  role: "ORG_ADMIN" | "COMPANY_ADMIN" | "VP_SALES" | "DIRECTOR" | "AE";
  imageUrl?: string | null;
}

interface AppShellProps {
  user: AppShellUser;
  pendingTaskCount?: number;
  children: React.ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  badge?: string;
}

export function AppShell({ user, pendingTaskCount = 0, children }: AppShellProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  const primaryNav: NavItem[] = (() => {
    if (user.role === "AE") {
      return [
        { href: "/ae/card", label: "My Card" },
        { href: "/improve", label: "Improve" },
        { href: "/knowledge", label: "Knowledge" },
        { href: "/tasks", label: "Tasks" },
        { href: "/ae/quizzes", label: "Quizzes" },
      ];
    }
    return [
      { href: "/dashboard", label: "Dashboard" },
      ...(user.role === "ORG_ADMIN" || user.role === "VP_SALES" ? [{ href: "/director/questions", label: "Questions" }] : []),
      { href: "/director/products", label: "Products" },
      { href: "/director/knowledge", label: "Knowledge" },
      { href: "/director/files", label: "Files" },
      { href: "/director/reviews", label: "Reviews" },
      { href: "/help", label: "Help" },
    ];
  })();

  const adminTab: NavItem | null =
    user.role === "ORG_ADMIN" || user.role === "COMPANY_ADMIN"
      ? { href: "/admin/users", label: "Users" }
      : user.role === "VP_SALES"
        ? { href: "/vp/team", label: "My Team" }
        : null;

  const analyzeTab: NavItem | null =
    user.role === "ORG_ADMIN" || user.role === "COMPANY_ADMIN"
      ? { href: "/admin/analyze", label: "Analyze" }
      : null;

  const tasksTab: NavItem = { href: "/tasks", label: "Tasks" };

  const initials = user.name
    .split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  // Combined nav for the drawer (visible on small screens)
  const drawerItems: NavItem[] = [
    ...primaryNav,
    ...(analyzeTab ? [analyzeTab] : []),
    ...(adminTab ? [adminTab] : []),
    tasksTab,
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-brand-navy text-white border-b border-white/10 shadow-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          {/* Left: hamburger + brand */}
          <div className="flex items-center gap-3 min-w-0">
            {/* Hamburger — visible whenever the inline nav can't fit */}
            <button
              type="button"
              className="lg:hidden -ml-1 p-2 rounded-brand hover:bg-white/10"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
              </svg>
            </button>
            <Link
              href={user.role === "AE" ? "/ae/card" : "/dashboard"}
              className="flex items-center gap-3 group shrink-0"
            >
              <div className="relative">
                <BrandMark />
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-brand-emerald ring-2 ring-brand-navy"></div>
              </div>
              <div className="hidden sm:block font-display text-base font-bold tracking-tight leading-tight">
                Sales Coach <span className="text-brand-orange">AI</span>
              </div>
            </Link>
          </div>

          {/* Center: primary nav (large screens only) */}
          <nav className="hidden lg:flex items-center gap-1 text-sm flex-1 justify-center min-w-0">
            {primaryNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-brand whitespace-nowrap transition-all duration-200 ease-brand ${
                  isActive(item.href)
                    ? "bg-white/15 text-white font-semibold"
                    : "text-white/75 hover:text-white hover:bg-white/5"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Right: admin + tasks + user menu */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
              className="hidden md:inline-flex items-center gap-1.5 px-2 py-1 rounded-brand text-xs text-white/85 hover:text-white hover:bg-white/5 border border-white/10 transition-colors"
              aria-label="Open search"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
              </svg>
              <span>Search</span>
              <kbd className="text-[10px] px-1 py-0.5 rounded bg-white/10 font-mono ml-0.5">⌘K</kbd>
            </button>
            {analyzeTab && (
              <Link
                href={analyzeTab.href}
                className={`hidden xl:inline-block px-3 py-1.5 rounded-brand text-sm transition-colors whitespace-nowrap ${
                  isActive(analyzeTab.href)
                    ? "bg-white/15 text-white font-semibold"
                    : "text-white/75 hover:text-white hover:bg-white/5"
                }`}
              >
                {analyzeTab.label}
              </Link>
            )}
            {adminTab && (
              <Link
                href={adminTab.href}
                className={`hidden xl:inline-block px-3 py-1.5 rounded-brand text-sm transition-colors whitespace-nowrap ${
                  isActive(adminTab.href)
                    ? "bg-white/15 text-white font-semibold"
                    : "text-white/75 hover:text-white hover:bg-white/5"
                }`}
              >
                {adminTab.label}
              </Link>
            )}
            <Link
              href={tasksTab.href}
              className={`relative inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-brand text-sm font-semibold transition-all whitespace-nowrap ${
                isActive(tasksTab.href)
                  ? "bg-brand-orange text-white shadow-orangeGlow"
                  : "bg-brand-orange/85 text-white hover:bg-brand-orange hover:shadow-orangeGlow"
              }`}
              aria-label="Tasks"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24">
                <path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="hidden sm:inline">Tasks</span>
              {/* Live count via /api/me/task-count — polls every 60s. Green
                  badge when ≥1 open task, hidden when zero. The static
                  pendingTaskCount prop is left as a fallback for SSR. */}
              <TasksNavBadge />
              {pendingTaskCount > 0 && (
                <noscript>
                  <span className="bg-white text-brand-orange text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                    {pendingTaskCount}
                  </span>
                </noscript>
              )}
            </Link>

            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-white/5 transition-colors"
                aria-label="Account menu"
              >
                {user.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.imageUrl} alt={user.name} className="w-8 h-8 rounded-full object-cover ring-2 ring-white/20" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-indigo to-brand-orange flex items-center justify-center text-xs font-bold ring-2 ring-white/10">
                    {initials}
                  </div>
                )}
                <svg className="w-4 h-4 text-white/85 hidden sm:block" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-72 rounded-card bg-white text-ink shadow-cardHover border border-ink-softLine animate-slideUp z-20 overflow-hidden">
                    <div className="px-4 py-3 border-b border-ink-softLine flex items-center gap-3">
                      {user.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={user.imageUrl} alt={user.name} className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-indigo to-brand-orange flex items-center justify-center text-sm font-bold text-white">
                          {initials}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm truncate">{user.name}</div>
                        <div className="text-xs text-ink-muted truncate">{user.email}</div>
                        <div className="badge-active mt-1.5">{prettyRole(user.role)}</div>
                      </div>
                    </div>
                    <nav className="py-1">
                      {user.role === "AE" ? (
                        <Link href="/ae/card" className="block px-4 py-2 text-sm hover:bg-surface-soft transition-colors">My Card</Link>
                      ) : (
                        <Link href="/director/profile" className="block px-4 py-2 text-sm hover:bg-surface-soft transition-colors">My Profile</Link>
                      )}
                      <Link href="/account" className="block px-4 py-2 text-sm hover:bg-surface-soft transition-colors">Account Settings</Link>
                      {user.role === "ORG_ADMIN" && (
                        <Link href="/admin/platform-settings" className="block px-4 py-2 text-sm hover:bg-surface-soft transition-colors">Platform Settings</Link>
                      )}
                      {(user.role === "ORG_ADMIN" || user.role === "COMPANY_ADMIN") && (
                        <Link href="/admin/orgs" className="block px-4 py-2 text-sm hover:bg-surface-soft transition-colors">
                          {user.role === "ORG_ADMIN" ? "Customer Orgs" : "Company Settings"}
                        </Link>
                      )}
                      <div className="border-t border-ink-softLine my-1" />
                      <button
                        onClick={() => signOut({ callbackUrl: "/login" })}
                        className="block w-full text-left px-4 py-2 text-sm font-semibold text-brand-red hover:bg-brand-red/5 transition-colors"
                      >
                        Sign out
                      </button>
                    </nav>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile/medium drawer */}
      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-brand-navy/60 lg:hidden"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <aside
            className="fixed left-0 top-0 bottom-0 z-50 w-72 bg-brand-navy text-white shadow-cardHover lg:hidden flex flex-col animate-slideUp"
            role="dialog"
            aria-label="Navigation"
          >
            <div className="px-4 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BrandMark />
                <div className="font-display font-bold tracking-tight">Sales Coach <span className="text-brand-orange">AI</span></div>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 rounded-brand hover:bg-white/10"
                aria-label="Close menu"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 py-2 overflow-y-auto">
              {drawerItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block px-4 py-2.5 text-sm transition-colors ${
                    isActive(item.href)
                      ? "bg-white/15 text-white font-semibold border-l-2 border-brand-orange"
                      : "text-white/80 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="px-4 py-3 border-t border-white/10 text-xs text-white/85">
              {prettyRole(user.role)} · {user.email}
            </div>
          </aside>
        </>
      )}

      <main className="flex-1 animate-fadeIn">{children}</main>

      <CommandPalette />
    </div>
  );
}

function prettyRole(role: AppShellUser["role"]) {
  switch (role) {
    case "ORG_ADMIN":     return "Super Admin";
    case "COMPANY_ADMIN": return "Company Admin";
    case "VP_SALES":      return "VP";
    case "DIRECTOR":      return "Director";
    case "AE":            return "AE";
  }
}

/**
 * Inline brand mark — no <img> 404 / cache risk.
 */
function BrandMark() {
  return (
    <svg
      width="36" height="36" viewBox="0 0 64 64"
      className="rounded-xl shadow-orangeGlow group-hover:scale-105 transition-transform"
      role="img" aria-label="Sales Coach AI"
    >
      <defs>
        <linearGradient id="bjbg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0B1F3A" />
          <stop offset="1" stopColor="#1F3C88" />
        </linearGradient>
        <linearGradient id="bjbolt" x1="20" y1="14" x2="44" y2="50" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF6A1A" />
          <stop offset="1" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#bjbg)" />
      <rect x="14" y="38" width="6" height="14" rx="2" fill="#1F3C88" opacity="0.55" />
      <rect x="24" y="30" width="6" height="22" rx="2" fill="#1F3C88" opacity="0.75" />
      <rect x="34" y="22" width="6" height="30" rx="2" fill="#1F3C88" opacity="0.95" />
      <path d="M44 14 L34 32 L41 32 L36 50 L52 28 L45 28 Z" fill="url(#bjbolt)" />
    </svg>
  );
}
