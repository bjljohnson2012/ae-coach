import { redirect } from "next/navigation";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { DirectorIntakeWizardClient } from "./DirectorIntakeWizardClient";

export default async function DirectorIntakePage() {
  const ctx = await requireRole("DIRECTOR", "ORG_ADMIN");
  const dp = await prisma.directorProfile.findUnique({ where: { userId: ctx.userId } });
  if (dp?.lastSynthesizedAt) redirect("/director/profile");

  return <DirectorIntakeWizardClient directorName={ctx.name} />;
}
