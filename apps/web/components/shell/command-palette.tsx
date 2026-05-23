"use client"

/**
 * Global ⌘K command palette.
 *
 * Keeps three groups in sync with the user's data:
 *   - Projects
 *   - Feature tests inside the active project (only when scoped to one)
 *   - Recent runs inside the active project (top 8)
 *
 * Plus three quick actions: New project, New feature test, Open settings.
 *
 * Lazy-loads the project's children only after the palette opens, so we
 * don't pay for the fetches on every page navigation.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  ActivityIcon,
  FlaskConicalIcon,
  FolderIcon,
  PlusIcon,
  Settings2Icon,
} from "lucide-react"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import {
  listProjects,
  listRunsByProject,
  listTestScenarios,
} from "@/lib/api"
import { runStatusLabel } from "@/lib/labels"

interface Item {
  id: string
  label: string
  hint?: string
  href: string
  icon: React.ReactNode
  group: "projects" | "tests" | "runs" | "actions"
  keywords?: string[]
}

function projectIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/projects\/([^/]+)(?:\/|$)/)
  return m ? m[1] : null
}

export function CommandPalette() {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const projectId = projectIdFromPath(pathname)

  // Open with ⌘K / Ctrl+K. Close with Esc (CommandDialog handles that).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isCmd = e.metaKey || e.ctrlKey
      if (isCmd && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(false)

  // Pull data when the palette opens. Fail soft: if any one fetch
  // fails, we show whatever we did get.
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [projects, scenarios, runs] = await Promise.all([
        listProjects().catch(() => []),
        projectId ? listTestScenarios(projectId).catch(() => []) : Promise.resolve([]),
        projectId ? listRunsByProject(projectId).catch(() => []) : Promise.resolve([]),
      ])

      const next: Item[] = []
      next.push(
        {
          id: "action-new-project",
          label: "New project",
          href: "/onboard",
          icon: <PlusIcon />,
          group: "actions",
          keywords: ["create", "add"],
        },
      )
      if (projectId) {
        next.push(
          {
            id: "action-new-test",
            label: "New feature test",
            href: `/projects/${projectId}/testsets/new`,
            icon: <PlusIcon />,
            group: "actions",
            keywords: ["create", "scenario"],
          },
          {
            id: "action-settings",
            label: "Project settings",
            href: `/projects/${projectId}/settings`,
            icon: <Settings2Icon />,
            group: "actions",
          },
        )
      }
      for (const p of projects) {
        next.push({
          id: `project-${p.id}`,
          label: p.name,
          hint: p.description,
          href: `/projects/${p.id}`,
          icon: <FolderIcon />,
          group: "projects",
          keywords: [p.id.slice(0, 8)],
        })
      }
      for (const s of scenarios) {
        next.push({
          id: `test-${s.id}`,
          label: s.title,
          hint: s.feature_description,
          href: `/projects/${projectId}/testsets/${s.id}`,
          icon: <FlaskConicalIcon />,
          group: "tests",
          keywords: [s.id.slice(0, 8), s.status],
        })
      }
      for (const r of runs.slice(0, 8)) {
        next.push({
          id: `run-${r.id}`,
          label: `Run ${r.id.slice(0, 8)}`,
          hint: runStatusLabel(r.status),
          href: `/projects/${projectId}/runs/${r.id}`,
          icon: <ActivityIcon />,
          group: "runs",
          keywords: [r.status, r.thread_id.slice(0, 8)],
        })
      }
      setItems(next)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (!open) return
    void refresh()
  }, [open, refresh])

  const groups = useMemo(() => {
    return {
      actions: items.filter((i) => i.group === "actions"),
      projects: items.filter((i) => i.group === "projects"),
      tests: items.filter((i) => i.group === "tests"),
      runs: items.filter((i) => i.group === "runs"),
    }
  }, [items])

  const navigate = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search Probe"
      description="Jump to a project, feature test, or run, or run a quick action."
    >
      <CommandInput placeholder="Search projects, feature tests, runs…" />
      <CommandList>
        {loading && (
          <div className="text-ink-3 py-6 text-center text-[12.5px]">
            Loading…
          </div>
        )}
        {!loading && (
          <>
            <CommandEmpty>Nothing matches.</CommandEmpty>

            {groups.actions.length > 0 && (
              <CommandGroup heading="Actions">
                {groups.actions.map((it) => (
                  <CommandItem
                    key={it.id}
                    value={`${it.label} ${it.keywords?.join(" ") ?? ""}`}
                    onSelect={() => navigate(it.href)}
                  >
                    {it.icon}
                    <span>{it.label}</span>
                    <CommandShortcut>↵</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {groups.projects.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Projects">
                  {groups.projects.map((it) => (
                    <CommandItem
                      key={it.id}
                      value={`${it.label} ${it.hint ?? ""} ${it.keywords?.join(" ") ?? ""}`}
                      onSelect={() => navigate(it.href)}
                    >
                      {it.icon}
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{it.label}</div>
                        {it.hint && (
                          <div className="text-ink-3 truncate text-[11.5px]">
                            {it.hint}
                          </div>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {groups.tests.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Feature tests">
                  {groups.tests.map((it) => (
                    <CommandItem
                      key={it.id}
                      value={`${it.label} ${it.hint ?? ""}`}
                      onSelect={() => navigate(it.href)}
                    >
                      {it.icon}
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{it.label}</div>
                        {it.hint && (
                          <div className="text-ink-3 truncate text-[11.5px]">
                            {it.hint}
                          </div>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {groups.runs.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Recent runs">
                  {groups.runs.map((it) => (
                    <CommandItem
                      key={it.id}
                      value={`${it.label} ${it.hint ?? ""}`}
                      onSelect={() => navigate(it.href)}
                    >
                      {it.icon}
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-[12.5px]">
                          {it.label}
                        </div>
                        {it.hint && (
                          <div className="text-ink-3 truncate text-[11.5px]">
                            {it.hint}
                          </div>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
