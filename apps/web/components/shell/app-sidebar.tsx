"use client"

import { useCallback } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ActivityIcon,
  ChevronsUpDownIcon,
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
  SidebarGroupLabel,
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
  // The brand mark: a small square chip using the accent teal.
  // The "Q" in Instrument Serif italic reads as a distinctive letterform
  // — small enough to work as an icon, distinctive enough to be the brand.
  return (
    <div
      aria-hidden
      className="grid size-6 shrink-0 place-items-center rounded-md font-serif italic"
      style={{
        background: "oklch(0.74 0.17 195)",
        color: "oklch(0.10 0.02 263)",
        fontSize: "14px",
        fontWeight: "400",
        lineHeight: 1,
        letterSpacing: "-0.01em",
        boxShadow: "0 1px 3px oklch(0.74 0.17 195 / 0.4)",
      }}
    >
      Q
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
               /* Active: left border indicator instead of background fill.
                * This prevents confusion with the neutral-grey badge accent
                * that also appears in the main content area. */
               "relative transition-colors",
               active
                 ? "text-sidebar-accent-foreground font-medium before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[3px] before:rounded-r-full before:bg-accent before:opacity-90"
                 : "text-sidebar-foreground/80",
               "hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
             )}
           >
             <Icon className={cn("size-[15px]", active ? "opacity-100" : "opacity-70")} />
             <span>{it.label}</span>
             {it.badge && (
               <SidebarMenuBadge
                 className={cn(
                   "ml-auto font-mono text-xs",
                   active
                     ? "bg-foreground/10 text-sidebar-accent-foreground"
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
      <SidebarHeader className="gap-3 px-3 pt-4">
        <div className="flex items-center gap-2 px-1">
          <QALoopMark />
          {/* Instrument Serif italic for the product name — editorial serif
           *  against the mono/sans UI text creates the brand's signature
           *  typographic moment even at small sidebar scale. */}
          <div className="font-serif text-[18px] leading-none font-normal tracking-[-0.01em] italic text-sidebar-foreground group-data-[state=collapsed]:hidden" style={{ color: "oklch(0.92 0.008 265)" }}>
            QALoop
          </div>
        </div>

        {project && (
          <Link
            href="/projects"
            className="bg-sidebar-accent/60 border-sidebar-border hover:bg-sidebar-accent group/proj mt-1 flex items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors group-data-[state=collapsed]:hidden"
          >
            <span
              aria-hidden
              className="bg-sidebar-accent text-accent-ink border-sidebar-border grid size-6 place-items-center rounded-md border font-mono text-xs font-semibold tracking-tight"
            >
              {project.name.slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-sidebar-foreground block truncate text-sm font-medium">
                {project.name}
              </span>
              <span className="text-sidebar-foreground/60 block truncate text-xs">
                Switch project
              </span>
            </span>
            <ChevronsUpDownIcon aria-hidden className="text-sidebar-foreground/40 size-[13px] transition-transform group-hover/proj:scale-110" />
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
          <SidebarGroup className="probe-slide-in">
            <SidebarGroupLabel className="text-2xs text-sidebar-foreground/50 px-3 pt-2 pb-1 tracking-[0.12em] uppercase group-data-[state=collapsed]:hidden">
              project
            </SidebarGroupLabel>
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
