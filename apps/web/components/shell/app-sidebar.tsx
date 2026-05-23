"use client"

import { useCallback } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ActivityIcon,
  ChevronLeftIcon,
  FlaskConicalIcon,
  FolderIcon,
  LayoutDashboardIcon,
  Settings2Icon,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { getProject, useFetch } from "@/lib/api"
import { cn } from "@/lib/utils"

type NavItem = {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  badge?: string
  match?: (path: string) => boolean
}

const TOP: NavItem[] = [
  {
    href: "/projects",
    icon: FolderIcon,
    label: "Projects",
    match: (p) =>
      p === "/projects" ||
      (p.startsWith("/projects") && p.split("/").length === 2),
  },
]

function buildProjectNav(projectId: string): NavItem[] {
  const base = `/projects/${projectId}`
  return [
    {
      href: base,
      icon: LayoutDashboardIcon,
      label: "Overview",
      match: (p) => p === base,
    },
    {
      href: `${base}/testsets`,
      icon: FlaskConicalIcon,
      label: "Feature tests",
      match: (p) => p.startsWith(`${base}/testsets`),
    },
    {
      href: `${base}/runs`,
      icon: ActivityIcon,
      label: "Runs",
      match: (p) => p.startsWith(`${base}/runs`),
    },
    {
      href: `${base}/settings`,
      icon: Settings2Icon,
      label: "Settings",
      match: (p) => p.startsWith(`${base}/settings`),
    },
  ]
}

function QALoopMark() {
  // A 24px square, mono-style. The dot replaces the second 'O' so the
  // mark reads as 'QAL○○P' at a glance; tightens to a clean square in
  // the collapsed sidebar.
  return (
    <div
      aria-hidden
      className="border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground grid size-[26px] place-items-center rounded-[5px] border font-mono text-[10.5px] font-semibold tracking-tight"
    >
      QL
    </div>
  )
}

function projectIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/projects\/([^/]+)(?:\/|$)/)
  return m ? m[1] : null
}

export function AppSidebar() {
  const pathname = usePathname()

  const projectId = projectIdFromPath(pathname)
  const projectQ = useFetch(
    useCallback(
      async () => (projectId ? getProject(projectId) : null),
      [projectId],
    ),
    [projectId],
  )
  const project = projectQ.data
  const projectNav = projectId ? buildProjectNav(projectId) : []

  const renderNav = (items: NavItem[]) =>
    items.map((it) => {
      const active = it.match
        ? it.match(pathname)
        : pathname === it.href || pathname.startsWith(it.href + "/")
      const Icon = it.icon
      return (
        <SidebarMenuItem key={`${it.href}-${it.label}`}>
          <SidebarMenuButton
            isActive={active}
            tooltip={it.label}
            render={
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                prefetch
              />
            }
            className={cn(
              "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground",
              "hover:bg-sidebar-accent/70",
            )}
          >
            <Icon className="size-[15px] opacity-85" />
            <span>{it.label}</span>
            {it.badge && (
              <SidebarMenuBadge
                className={cn(
                  "ml-auto font-mono text-[10.5px]",
                  active
                    ? "bg-accent text-sidebar"
                    : "bg-sidebar-border text-sidebar-foreground/60",
                )}
              >
                {it.badge}
              </SidebarMenuBadge>
            )}
          </SidebarMenuButton>
        </SidebarMenuItem>
      )
    })

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border border-r">
      <SidebarHeader className="gap-3 px-3 pt-3.5">
        <div className="flex items-center gap-2.5 px-1">
          <QALoopMark />
          <div className="text-sidebar-foreground font-sans text-[15px] leading-none font-semibold tracking-[-0.01em] group-data-[state=collapsed]:hidden">
            QALoop
          </div>
        </div>

        {project && (
          <Link
            href="/projects"
            className="bg-sidebar-accent/60 border-sidebar-border hover:bg-sidebar-accent group/proj mt-1 flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-left group-data-[state=collapsed]:hidden"
          >
            <span
              aria-hidden
              className="bg-sidebar-accent text-accent-ink border-sidebar-border grid size-[24px] place-items-center rounded-[5px] border font-mono text-[10.5px] font-semibold tracking-tight"
            >
              {project.name.slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-sidebar-foreground block truncate text-[12.5px] font-medium">
                {project.name}
              </span>
              <span className="text-sidebar-foreground/60 block truncate text-[11px]">
                Switch project
              </span>
            </span>
            <ChevronLeftIcon className="text-sidebar-foreground/50 size-[13px] transition-transform group-hover/proj:-translate-x-0.5" />
          </Link>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>{renderNav(TOP)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {project && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>{renderNav(projectNav)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter />

      <SidebarRail />
    </Sidebar>
  )
}
