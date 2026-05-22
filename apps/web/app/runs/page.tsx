import { redirect } from "next/navigation"

export default function LegacyRunsRedirect() {
  redirect("/projects")
}
