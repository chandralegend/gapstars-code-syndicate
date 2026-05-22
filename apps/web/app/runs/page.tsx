import { redirect } from "next/navigation"

import { DEFAULT_PROJECT_ID } from "@/lib/mock/projects"

export default function LegacyRunsRedirect() {
  redirect(`/projects/${DEFAULT_PROJECT_ID}/runs`)
}
