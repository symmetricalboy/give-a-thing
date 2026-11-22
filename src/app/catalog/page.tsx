import { redirect } from "next/navigation";

export default function LegacyCatalogRedirectPage() {
  redirect("/search");
}
