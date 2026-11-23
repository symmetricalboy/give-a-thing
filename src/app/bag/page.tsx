import { redirect } from "next/navigation";

export default function LegacyBagRedirectPage() {
  redirect("/profile");
}
