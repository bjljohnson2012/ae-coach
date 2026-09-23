import Link from "next/link";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { FileMapperUploader } from "./FileMapperUploader";

export default async function FilesPage() {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");

  const files = await prisma.fileAsset.findMany({
    where: { orgId: ctx.effectiveOrgId },
    include: {
      aeProfile: { include: { user: { select: { name: true } } } },
      mapping: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const aes = await prisma.aeProfile.findMany({
    where:
      ctx.role === "ORG_ADMIN" || ctx.role === "COMPANY_ADMIN"
        ? { orgId: ctx.effectiveOrgId }
        : ctx.role === "VP_SALES"
          ? { director: { vpId: ctx.userId } }
          : { directorId: ctx.userId },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="page">
      <header className="mb-6">
        <div className="eyebrow mb-2">Files</div>
        <h1 className="h-page">Coaching artifacts</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Drop a file, AI suggests routing, you confirm. Coaching docs auto-cross-reference the AE's profile.
        </p>
      </header>

      <FileMapperUploader aes={aes.map((a) => ({ id: a.id, name: a.user.name }))} />

      <div className="flex items-center justify-between mt-8 mb-3">
        <h2 className="h-section">Recent uploads</h2>
        <span className="meta">{files.length} {files.length === 1 ? "file" : "files"}</span>
      </div>

      {files.length === 0 ? (
        <div className="card p-12 text-center text-sm text-ink-muted">No uploads yet.</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-ink-muted bg-surface-soft">
              <tr>
                <th className="px-5 py-2.5 font-semibold">Filename</th>
                <th className="px-5 py-2.5 font-semibold">Kind</th>
                <th className="px-5 py-2.5 font-semibold">AE</th>
                <th className="px-5 py-2.5 font-semibold">Visibility</th>
                <th className="px-5 py-2.5 font-semibold">Uploaded</th>
                <th className="px-5 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id} className="border-t border-ink-softLine hover:bg-brand-indigo/5">
                  <td className="px-5 py-3">
                    <div className="font-medium truncate max-w-xs">{f.filename}</div>
                    <div className="meta">{(f.sizeBytes / 1024).toFixed(1)} KB · {f.mimeType}</div>
                  </td>
                  <td className="px-5 py-3"><span className="badge-neutral">{f.kind.replace(/_/g, " ")}</span></td>
                  <td className="px-5 py-3 text-ink-slate">{f.aeProfile?.user.name ?? "—"}</td>
                  <td className="px-5 py-3 text-xs">{f.visibility.replace(/_/g, " ")}</td>
                  <td className="px-5 py-3 meta">{f.createdAt.toLocaleDateString()}</td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/director/files/${f.id}`} className="link text-xs">Edit</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
