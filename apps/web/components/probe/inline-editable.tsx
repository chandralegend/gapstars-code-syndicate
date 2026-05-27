"use client"

import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

export function InlineEditable({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string
  onChange?: (next: string) => void
  placeholder?: string
  className?: string
}) {
  // `value` is the source of truth; we only hold a draft while editing.
  const [draft, setDraft] = useState<string | null>(null)
  const editing = draft !== null
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={cn(
          "border-border bg-card focus:ring-ring/40 inline-flex rounded-sm border px-1.5 py-[2px] text-[inherit] outline-none focus:ring-2",
          className
        )}
        value={draft ?? ""}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          onChange?.(draft ?? "")
          setDraft(null)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur()
          if (e.key === "Escape") setDraft(null)
        }}
      />
    )
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setDraft(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") setDraft(value)
      }}
      className={cn(
        "hover:bg-muted cursor-text rounded-sm px-[3px] py-px",
        className
      )}
    >
      {value || <span className="text-ink-4">{placeholder}</span>}
    </span>
  )
}
