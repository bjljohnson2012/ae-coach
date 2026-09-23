"use client";
import { useEffect, useState, useRef } from "react";

/**
 * "What Good Looks Like" benchmark editor for one org.
 *
 * For each skill: shows the platform default + this org's override + uploaded
 * reference files + AI-synthesized draft. Admin can:
 *   1. Edit the override directly
 *   2. Upload files (top-rep transcripts, win stories, training docs)
 *   3. Click "AI synthesize" → reads files → produces a draft override
 *   4. Accept the draft or keep editing manually
 *   5. Clear the override (falls back to platform default)
 */

interface BenchmarkFile {
  id: string;
  filename: string;
  createdAt: string;
  uploadedBy: { name: string };
}

interface SkillRow {
  category: string;
  label: string;
  definition: string;
  platformDefaultWhatGoodLooksLike: string;
  override: {
    id: string;
    whatGoodLooksLike: string | null;
    customNotes: string | null;
    aiSynthesizedSummary: string | null;
    lastSynthesizedAt: string | null;
    files: BenchmarkFile[];
  } | null;
  effectiveWhatGoodLooksLike: string;
}

export function SkillsBenchmarkPanel({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCategory, setOpenCategory] = useState<string | null>(null);

  useEffect(() => { void load(); }, [orgId]);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/orgs/${orgId}/skills`);
    const j = await res.json().catch(() => ({}));
    setSkills(j.skills ?? []);
    setLoading(false);
  }

  if (loading) {
    return <div className="card p-6 text-sm text-ink-muted">Loading skill benchmarks…</div>;
  }

  return (
    <section className="space-y-3">
      <header>
        <div className="eyebrow mb-1">Skills</div>
        <h2 className="h-section">What good looks like at {orgName}</h2>
        <p className="text-sm text-ink-muted mt-1">
          For each skill, the platform default sets a starting bar. Override it to define
          what world-class looks like in your specific motion. Upload top-rep transcripts,
          win stories, or training docs and the AI will synthesize a refined definition you
          can review and accept.
        </p>
      </header>

      <div className="space-y-2">
        {skills.map((skill) => (
          <SkillRowCard
            key={skill.category}
            orgId={orgId}
            skill={skill}
            isOpen={openCategory === skill.category}
            onToggle={() => setOpenCategory(openCategory === skill.category ? null : skill.category)}
            onChange={load}
          />
        ))}
      </div>
    </section>
  );
}

function SkillRowCard({
  orgId,
  skill,
  isOpen,
  onToggle,
  onChange,
}: {
  orgId: string;
  skill: SkillRow;
  isOpen: boolean;
  onToggle: () => void;
  onChange: () => Promise<void>;
}) {
  const isCustomized = !!skill.override?.whatGoodLooksLike;

  return (
    <div className={`card overflow-hidden ${isCustomized ? "border-l-4 border-brand-emerald" : ""}`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-brand-indigo/5 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-semibold">{skill.label}</span>
            {isCustomized ? (
              <span className="badge-success text-[10px]">Customized</span>
            ) : (
              <span className="badge-neutral text-[10px]">Platform default</span>
            )}
            {skill.override && skill.override.files.length > 0 && (
              <span className="meta">{skill.override.files.length} reference file{skill.override.files.length === 1 ? "" : "s"}</span>
            )}
          </div>
          <p className="meta mt-1 line-clamp-2">{skill.effectiveWhatGoodLooksLike}</p>
        </div>
        <span className="text-ink-muted text-sm shrink-0">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <SkillEditor orgId={orgId} skill={skill} onChange={onChange} />
      )}
    </div>
  );
}

function SkillEditor({
  orgId,
  skill,
  onChange,
}: {
  orgId: string;
  skill: SkillRow;
  onChange: () => Promise<void>;
}) {
  const [override, setOverride] = useState(skill.override?.whatGoodLooksLike ?? "");
  const [notes, setNotes] = useState(skill.override?.customNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthResult, setSynthResult] = useState<{
    refinedWhatGoodLooksLike: string;
    themesObserved: string[];
    evidenceCitations: string[];
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/orgs/${orgId}/skills/${skill.category}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        whatGoodLooksLike: override.trim() || null,
        customNotes: notes.trim() || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Save failed.");
      return;
    }
    await onChange();
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/orgs/${orgId}/skills/${skill.category}/files`, {
      method: "POST",
      body: fd,
    });
    setUploading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Upload failed.");
      return;
    }
    await onChange();
  }

  async function deleteFile(fileId: string) {
    if (!confirm("Remove this reference file?")) return;
    const res = await fetch(`/api/orgs/${orgId}/skills/${skill.category}/files/${fileId}`, {
      method: "DELETE",
    });
    if (!res.ok) return;
    await onChange();
  }

  async function synthesize() {
    setSynthesizing(true);
    setError(null);
    setSynthResult(null);
    const res = await fetch(`/api/orgs/${orgId}/skills/${skill.category}/synthesize`, {
      method: "POST",
    });
    setSynthesizing(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Synthesis failed.");
      return;
    }
    const j = await res.json();
    setSynthResult(j.synthesis);
    await onChange();
  }

  return (
    <div className="border-t border-ink-softLine p-5 space-y-4 bg-surface-soft">
      {/* Definition + platform default */}
      <div>
        <div className="eyebrow mb-1">What this skill is</div>
        <p className="text-sm text-ink-slate">{skill.definition}</p>
      </div>

      <div>
        <div className="eyebrow mb-1">Platform default — what good looks like</div>
        <p className="text-sm text-ink-slate p-3 rounded-brand bg-white border border-ink-softLine">
          {skill.platformDefaultWhatGoodLooksLike}
        </p>
      </div>

      {/* Org override editor */}
      <div>
        <label className="eyebrow mb-1 block">Your org's override <span className="meta">(leave blank to use platform default)</span></label>
        <textarea
          className="input min-h-[100px]"
          value={override}
          onChange={(e) => setOverride(e.target.value)}
          placeholder="Describe what world-class looks like for this skill at your company. Be specific — name your buyers, your motion, your stack."
        />
      </div>

      <div>
        <label className="eyebrow mb-1 block">Coaching notes <span className="meta">(internal — not shown on profile popovers)</span></label>
        <textarea
          className="input min-h-[60px]"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any additional context for your coaches. Internal use only."
        />
      </div>

      {/* Reference files */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="eyebrow">Reference files</div>
          <span className="meta">{skill.override?.files.length ?? 0} uploaded</span>
        </div>
        <p className="meta mb-2">
          Upload call transcripts, win stories, training docs, top-rep examples. The AI uses these to
          synthesize a refined definition.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.txt,.md,.html,.htm"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="btn-secondary text-xs"
        >
          {uploading ? "Uploading…" : "+ Upload reference file"}
        </button>

        {skill.override?.files && skill.override.files.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {skill.override.files.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 text-xs p-2 rounded-brand bg-white border border-ink-softLine">
                <span className="flex items-center gap-2 min-w-0">
                  <span aria-hidden="true">📄</span>
                  <span className="font-medium truncate">{f.filename}</span>
                  <span className="meta shrink-0">{f.uploadedBy.name} · {new Date(f.createdAt).toLocaleDateString()}</span>
                </span>
                <button
                  type="button"
                  onClick={() => deleteFile(f.id)}
                  className="text-brand-red text-xs hover:underline shrink-0"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* AI synthesize */}
      {(skill.override?.files.length ?? 0) > 0 && (
        <div className="card p-4 bg-brand-indigo/5 border border-brand-indigo/20">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="eyebrow text-brand-indigo mb-1">AI synthesize</div>
              <p className="text-xs text-ink-slate">
                Read all reference files and produce a refined "what good looks like" paragraph.
                Review and accept (or keep editing).
              </p>
            </div>
            <button
              type="button"
              onClick={synthesize}
              disabled={synthesizing}
              className="btn-primary text-xs"
            >
              {synthesizing ? "Synthesizing…" : "✨ Synthesize from files"}
            </button>
          </div>

          {(synthResult || skill.override?.aiSynthesizedSummary) && (
            <div className="mt-4 space-y-3">
              <div>
                <div className="text-xs font-bold text-brand-indigo mb-1">AI-refined definition</div>
                <div className="text-sm p-3 rounded-brand bg-white border border-brand-indigo/30">
                  {synthResult?.refinedWhatGoodLooksLike ?? skill.override?.aiSynthesizedSummary}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const text = synthResult?.refinedWhatGoodLooksLike ?? skill.override?.aiSynthesizedSummary ?? "";
                    setOverride(text);
                  }}
                  className="btn-secondary text-xs mt-2"
                >
                  ↑ Use this as my override
                </button>
              </div>

              {synthResult?.themesObserved && synthResult.themesObserved.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-ink-slate mb-1">Themes observed</div>
                  <ul className="text-xs space-y-0.5">
                    {synthResult.themesObserved.map((t, i) => (
                      <li key={i} className="flex gap-1.5"><span className="text-brand-emerald shrink-0">✓</span><span>{t}</span></li>
                    ))}
                  </ul>
                </div>
              )}

              {synthResult?.evidenceCitations && synthResult.evidenceCitations.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-ink-slate mb-1">Evidence from your files</div>
                  <ul className="text-xs space-y-1">
                    {synthResult.evidenceCitations.map((c, i) => (
                      <li key={i} className="italic p-2 rounded-brand bg-ink-softLine/30">"{c}"</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="text-sm text-brand-red bg-brand-red/5 border border-brand-red/20 rounded-brand p-3">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="btn-primary text-sm"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
