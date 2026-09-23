import { HelpClient } from "./HelpClient";
import { requireSession } from "@/lib/tenancy";

export default async function HelpPage() {
  const ctx = await requireSession();
  return <HelpClient role={ctx.role} />;
}
