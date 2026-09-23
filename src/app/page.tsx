import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/tenancy";

export default async function Root() {
  const ctx = await getSessionOrNull();
  if (!ctx) redirect("/login");
  redirect("/dashboard");
}
