"use client"

import { useEffect, useRef, useState } from "react"
import { Check, ChevronDown, Loader2 } from "lucide-react"

import { fetchProviders } from "@/lib/api"
import {
  type LLMProviderName,
  type ModelInfo,
  type ProviderInfo,
  PROVIDER_DISPLAY,
} from "@/lib/types"
import { cn } from "@/lib/utils"

interface ProviderSelectorProps {
  selectedProvider: LLMProviderName | null
  selectedModel: string | null
  onProviderChange: (provider: LLMProviderName) => void
  onModelChange: (model: string) => void
  disabled?: boolean
}

// ── Provider icon SVGs ────────────────────────────────────────────────────────

function OpenAIIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
    </svg>
  )
}

function MistralIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M0 0h4v4H0zm0 8h4v4H0zm0 8h4v4H0zM20 0h4v4h-4zm0 16h4v4h-4zM8 0h4v4H8zm8 0h4v4h-4zm-8 4h4v4H8zm4 0h4v4h-4zM8 12h4v4H8zm4 0h4v4h-4zm-4 4h4v4H8zm4 0h4v4h-4z" />
    </svg>
  )
}

function AnthropicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48zm-3.654 0H6.57L0 20h3.603l1.378-3.504h6.875L10.48 13h-4.17l2.504-6.28L13.173 20h3.603l-6.603-16.48z" />
    </svg>
  )
}

const PROVIDER_ICONS: Record<LLMProviderName, React.ComponentType<{ className?: string }>> = {
  openai: OpenAIIcon,
  mistral: MistralIcon,
  anthropic: AnthropicIcon,
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ProviderSelector({
  selectedProvider,
  selectedModel,
  onProviderChange,
  onModelChange,
  disabled,
}: ProviderSelectorProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [activeTab, setActiveTab] = useState<LLMProviderName>("openai")
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Load providers on mount
  useEffect(() => {
    fetchProviders()
      .then((data) => {
        setProviders(data.providers)
        // Initialise selection to the server default if nothing picked yet
        if (!selectedProvider) {
          const defaultProvider = data.default_provider
          const info = data.providers.find((p) => p.id === defaultProvider)
          if (info?.available) {
            onProviderChange(defaultProvider)
            onModelChange(info.default_model)
            setActiveTab(defaultProvider)
          } else {
            // Fall back to first available provider
            const first = data.providers.find((p) => p.available)
            if (first) {
              onProviderChange(first.id)
              onModelChange(first.default_model)
              setActiveTab(first.id)
            }
          }
        } else {
          setActiveTab(selectedProvider)
        }
      })
      .catch(() => setError("Failed to load providers"))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const activeProvider = providers.find((p) => p.id === activeTab)
  const currentProviderInfo = providers.find((p) => p.id === selectedProvider)
  const currentModelInfo = currentProviderInfo?.models.find((m) => m.id === selectedModel)

  const displayLabel =
    loading
      ? "Loading…"
      : error
        ? "Unavailable"
        : selectedProvider
          ? `${PROVIDER_DISPLAY[selectedProvider].label} · ${currentModelInfo?.name ?? selectedModel ?? "—"}`
          : "Select model"

  function handleProviderTab(provider: LLMProviderName) {
    setActiveTab(provider)
    // Reset scroll so the new provider's list starts at the top
    if (listRef.current) listRef.current.scrollTop = 0
  }

  function handleModelSelect(model: ModelInfo) {
    onProviderChange(activeTab)
    onModelChange(model.id)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium",
          "transition-colors hover:bg-muted/60",
          "disabled:cursor-not-allowed disabled:opacity-50",
          open && "bg-muted"
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {loading ? (
          <Loader2 className="size-3 animate-spin" />
        ) : selectedProvider ? (
          (() => {
            const Icon = PROVIDER_ICONS[selectedProvider]
            return <Icon className="size-3" />
          })()
        ) : null}
        <span className="max-w-[180px] truncate">{displayLabel}</span>
        <ChevronDown
          className={cn("size-3 shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>

      {/* Dropdown */}
      {open && !loading && !error && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-xl border bg-popover shadow-lg">
          {/* Provider tabs */}
          <div className="flex border-b">
            {providers.map((p) => {
              const Icon = PROVIDER_ICONS[p.id]
              const display = PROVIDER_DISPLAY[p.id]
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={!p.available}
                  onClick={() => handleProviderTab(p.id)}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-1 px-2 py-2.5 text-xs font-medium",
                    "transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-40",
                    activeTab === p.id
                      ? "border-b-2 border-primary text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  <Icon className="size-4" />
                  <span>{display.label}</span>
                </button>
              )
            })}
          </div>

          {/* Model list */}
          <div ref={listRef} className="max-h-56 overflow-y-auto py-1">
            {!activeProvider?.available ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                No API key configured
              </p>
            ) : activeProvider.models.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                No models found
              </p>
            ) : (
              activeProvider.models.map((m) => {
                const isSelected = selectedProvider === activeTab && selectedModel === m.id
                return (
                  <button
                    key={`${activeTab}:${m.id}`}
                    type="button"
                    onClick={() => handleModelSelect(m)}
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-2 text-left text-xs",
                      "transition-colors hover:bg-muted/60",
                      isSelected && "bg-muted"
                    )}
                  >
                    <span className="truncate font-medium">{m.name}</span>
                    {isSelected && <Check className="ml-2 size-3 shrink-0 text-primary" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}

      {error && (
        <span className="ml-2 text-xs text-destructive">{error}</span>
      )}
    </div>
  )
}
