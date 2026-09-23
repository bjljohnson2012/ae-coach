"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function CoachingNoteForm({ aeProfileId }: { aeProfileId: string }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true); setError(null);
    const res = await fetch("/api/coaching-note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aeProfileId, content, visibleToAe: visible }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Failed to save.");
      return;
    }
    setContent("");
    setVisible(false);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <textarea
        className="input min-h-[80px]"
        placeholder="Drop a coaching note. Toggle 'visible to AE' if you want them to see it."
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
          Visible to AE
        </label>
        {error && <span className="text-sm text-red-600">{error}</span>}
        <button type="submit" disabled={saving} className="btn-primary text-sm">
          {saving ? "Saving…" : "Add note"}
        </button>
      </div>
    </form>
  );
}
