import { redirect } from "next/navigation"

import { DEFAULT_PROJECT_ID } from "@/lib/mock/projects"

export default async function LegacyRunDetailRedirect({
  params,
}: {
  params: Promise<{ runId: string }>
}) {
  const { runId } = await params
  redirect(`/projects/${DEFAULT_PROJECT_ID}/runs/${runId}`)
}
