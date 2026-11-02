import { redirect } from "next/navigation";

// The member portal is a single page now; old links land there.
export default function Page() {
  redirect("/app");
}
