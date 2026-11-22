import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function MyBagPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/");
  }
  redirect(`/u/${encodeURIComponent(session.handle)}`);
}
