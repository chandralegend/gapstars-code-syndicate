import { redirect } from "next/navigation"

import { DEFAULT_PROJECT_ID } from "@/lib/mock/projects"

export default function LegacyTestsNewRedirect() {
  redirect(`/projects/${DEFAULT_PROJECT_ID}/testsets/new`)
}
