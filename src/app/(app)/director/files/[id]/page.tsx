import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { EditFileForm } from "./EditFileForm";

export default async function EditFilePage({ params }: { params: { id: string } }) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const file = await prisma.fileAsset.findUnique({
    where: { id: params.id },
    include: { aeProfile: { include: { user: { select: { name: true } } } } },
  });
  if (!file || file.orgId !== ctx.effectiveOrgId) notFound();

  const aes = await prisma.aeProfile.findMany({
    where: { orgId: ctx.effectiveOrgId },
    include: { user: { select: { name: true } } },
  });

  return (
    <div className="page max-w-2xl">
      <Link href="/director/files" className="link text-sm">← All files</Link>
      <h1 className="h-page mt-2">{file.filename}</h1>
      <p className="meta mt-1">
        {(file.sizeBytes / 1024).toFixed(1)} KB · {file.mimeType} · uploaded {file.createdAt.toLocaleDateString()}
      </p>
      <EditFileForm
        file={{
          id: file.id,
          filename: file.filename,
          kind: file.kind,
          visibility: file.visibility,
          aeProfileId: file.aeProfileId,
        }}
        aes={aes.map((a) => ({ id: a.id, name: a.user.name }))}
      />
    </div>
  );
}
