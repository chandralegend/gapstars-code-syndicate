import { SparklesIcon } from "lucide-react"

import { Progress } from "@/components/ui/progress"

export function CostBar({ pct = 20 }: { pct?: number }) {
  return (
    <div className="border-border bg-card mt-5 space-y-2 rounded-lg border p-4">
      <div className="flex items-center text-[12.5px]">
        <span className="text-ink-3 w-[80px] shrink-0">Run budget</span>
        <span>$0.40</span>
        <span className="text-ink-4 ml-auto font-mono text-[11px]">
          of $2.00 cap
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
      <div className="text-ink-4 flex items-center text-[11px]">
        <span className="flex items-center gap-1.5">
          <SparklesIcon className="size-[11px]" />
          67.4k tokens
        </span>
        <span className="ml-auto">Claude Sonnet 4.5</span>
      </div>
    </div>
  )
}
