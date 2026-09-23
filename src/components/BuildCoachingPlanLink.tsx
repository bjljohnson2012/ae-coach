import Link from "next/link";

/**
 * Inline link/button that scrolls or routes to the Coaching Plans section
 * of a profile. The actual "Build" action lives inside CoachingPlansTab —
 * this is just the entry point from the profile page header.
 */
export function BuildCoachingPlanLink({ targetUrl }: { targetUrl: string }) {
  return (
    <Link href={targetUrl} className="btn-primary text-sm">
      📘 Build Coaching Plan
    </Link>
  );
}
