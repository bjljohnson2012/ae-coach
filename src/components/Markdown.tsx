/**
 * Tiny markdown renderer — server-safe, no extra deps.
 * Handles: # ## ### headings, **bold**, *italic*, `code`, [links](url),
 * - / 1. lists, > blockquotes, --- hr, paragraphs.
 *
 * Outputs Tailwind-styled HTML. Inputs are escaped before tag conversion
 * to prevent injection. Use for AI-generated and user-pasted markdown.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inline(s: string): string {
  // Apply inline formatting — input is already HTML-escaped at this point.
  return s
    // Code (backticks) — handle first so its contents don't get other inline styles
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-ink-softLine/60 text-ink font-mono text-[0.9em]">$1</code>')
    // Bold + italic combined
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Italic — single * but only when balanced and not part of bold
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    // Links — [text](url). url must start with http/https/mailto/anchor
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+|#[^\s)]+|\/[^\s)]*)\)/g,
      '<a href="$2" class="text-brand-indigo hover:text-brand-indigoDeep underline" target="_blank" rel="noopener noreferrer">$1</a>'
    );
}

export function markdownToHtml(md: string): string {
  if (!md) return "";

  const escaped = escapeHtml(md);
  const lines = escaped.split(/\r?\n/);
  const out: string[] = [];

  let inUl = false;
  let inOl = false;
  let inBlockquote = false;
  let paragraphBuf: string[] = [];

  function flushParagraph() {
    if (paragraphBuf.length === 0) return;
    const text = paragraphBuf.join(" ");
    out.push(`<p class="mb-3 leading-relaxed">${inline(text)}</p>`);
    paragraphBuf = [];
  }
  function closeUl() { if (inUl) { out.push("</ul>"); inUl = false; } }
  function closeOl() { if (inOl) { out.push("</ol>"); inOl = false; } }
  function closeBlockquote() { if (inBlockquote) { out.push("</blockquote>"); inBlockquote = false; } }
  function closeAll() {
    flushParagraph();
    closeUl();
    closeOl();
    closeBlockquote();
  }

  for (const rawLine of lines) {
    const line = rawLine;
    const trimmed = line.trim();

    // Empty line — break paragraph + lists
    if (trimmed === "") {
      closeAll();
      continue;
    }

    // Horizontal rule
    if (/^(---|\*\*\*|___)$/.test(trimmed)) {
      closeAll();
      out.push('<hr class="my-4 border-ink-softLine" />');
      continue;
    }

    // Headings
    const h = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      closeAll();
      const level = h[1].length;
      const sizes: Record<number, string> = {
        1: "text-2xl font-display font-bold mt-4 mb-3",
        2: "text-xl font-display font-bold mt-4 mb-2",
        3: "text-lg font-display font-semibold mt-3 mb-2",
        4: "text-base font-semibold mt-3 mb-1",
        5: "text-sm font-semibold mt-2 mb-1",
        6: "text-sm font-semibold mt-2 mb-1 uppercase tracking-wider text-ink-muted",
      };
      out.push(`<h${level} class="${sizes[level]}">${inline(h[2])}</h${level}>`);
      continue;
    }

    // Unordered list — - or * (with space)
    const ul = trimmed.match(/^[-*]\s+(.+)$/);
    if (ul) {
      flushParagraph();
      closeOl();
      closeBlockquote();
      if (!inUl) { out.push('<ul class="list-disc pl-5 space-y-1 mb-3">'); inUl = true; }
      out.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }

    // Ordered list — 1. or 2)
    const ol = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (ol) {
      flushParagraph();
      closeUl();
      closeBlockquote();
      if (!inOl) { out.push('<ol class="list-decimal pl-5 space-y-1 mb-3">'); inOl = true; }
      out.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }

    // Blockquote
    const bq = trimmed.match(/^>\s?(.*)$/);
    if (bq) {
      flushParagraph();
      closeUl();
      closeOl();
      if (!inBlockquote) { out.push('<blockquote class="border-l-4 border-brand-orange pl-3 italic text-ink-slate my-3">'); inBlockquote = true; }
      out.push(`<p class="mb-1">${inline(bq[1])}</p>`);
      continue;
    }

    // Paragraph line
    closeUl();
    closeOl();
    closeBlockquote();
    paragraphBuf.push(trimmed);
  }

  closeAll();
  return out.join("\n");
}

interface Props {
  source: string;
  className?: string;
}

/** React component — renders markdown safely. */
export function Markdown({ source, className = "" }: Props) {
  return (
    <div
      className={`prose-sm max-w-none ${className}`}
      // The HTML is generated from escaped input — safe.
      dangerouslySetInnerHTML={{ __html: markdownToHtml(source) }}
    />
  );
}
