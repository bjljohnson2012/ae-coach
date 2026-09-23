"use client";
import Link from "next/link";
import { useState } from "react";
import { SmartBulkButton } from "./SmartBulkButton";

interface Q {
  id: string;
  text: string;
  questionType: string;
  active: boolean;
  aiGenerated: boolean;
  authorUserId: string | null;
  product: { name: string } | null;
  // Owner attribution shown when ORG_ADMIN is viewing the All scope —
  // helps distinguish "global / shared" questions from a specific company's bank.
  ownerOrgName?: string | null;
  isGlobal?: boolean;
}

const PREVIEW = 10;

export function CollapsibleSection({
  category,
  prettyCategory,
  questions,
  canEditAny,
  currentUserId,
  defaultOpen = false,
}: {
  category: string;
  prettyCategory: string;
  questions: Q[];
  canEditAny: boolean;
  currentUserId: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? questions : questions.slice(0, PREVIEW);
  const hasMore = questions.length > PREVIEW;

  return (
    <section className="card overflow-hidden">
      <header className="px-5 py-3 border-b border-ink-softLine bg-surface-soft flex items-center justify-between gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <svg
            className={`w-4 h-4 text-ink-muted transition-transform shrink-0 ${open ? "rotate-90" : ""}`}
            fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"
          >
            <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="font-display font-semibold text-ink">{prettyCategory}</span>
          <span className="badge-neutral">{questions.length}</span>
        </button>
        <div className="flex items-center gap-2">
          <SmartBulkButton category={category} prettyCategory={prettyCategory} />
          <Link
            href={`/director/questions/new?category=${category}`}
            className="btn-ghost text-xs whitespace-nowrap"
          >
            + New
          </Link>
        </div>
      </header>

      {open && (
        questions.length === 0 ? (
          <div className="px-5 py-6 text-center text-sm text-ink-muted">
            No questions yet in this section.{" "}
            <Link href={`/director/questions/new?category=${category}`} className="link">
              Add the first one →
            </Link>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-ink-softLine">
              {visible.map((q) => (
                <li key={q.id} className="px-5 py-3 flex items-start justify-between gap-3 hover:bg-brand-indigo/5 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm ${q.active ? "text-ink" : "text-ink-muted line-through"}`}>{q.text}</div>
                    <div className="meta mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>{q.questionType.toLowerCase().replace("_", " ")}</span>
                      {q.product ? <span>· {q.product.name}</span> : null}
                      {q.aiGenerated ? <span>· AI-generated</span> : null}
                      {!q.active ? <span>· inactive</span> : null}
                      {q.isGlobal ? (
                        <span className="badge-neutral text-[10px]">🌐 Platform</span>
                      ) : q.ownerOrgName ? (
                        <span className="badge-active text-[10px]">{q.ownerOrgName}</span>
                      ) : null}
                    </div>
                  </div>
                  {(canEditAny || q.authorUserId === currentUserId) && (
                    <Link
                      href={`/director/questions/${q.id}/edit`}
                      className="btn-ghost text-xs shrink-0"
                    >
                      Edit
                    </Link>
                  )}
                </li>
              ))}
            </ul>
            {hasMore && (
              <div className="px-5 py-3 border-t border-ink-softLine bg-surface-soft text-center">
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="link text-sm"
                >
                  {showAll
                    ? `Show only first ${PREVIEW}`
                    : `Show all ${questions.length} →`}
                </button>
              </div>
            )}
          </>
        )
      )}
    </section>
  );
}
