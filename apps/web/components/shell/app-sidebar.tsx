"use client"

import { usePathname, useRouter } from "next/navigation"
import {
  ActivityIcon,
  CodeIcon,
  FlaskConicalIcon,
  HistoryIcon,
  Settings2Icon,
  SparklesIcon,
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
import { cn } from "@/lib/utils"

type NavItem = {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  badge?: string
  match?: (path: string) => boolean
}

const WORKSPACE: NavItem[] = [
  { href: "/tests", icon: FlaskConicalIcon, label: "Tests", badge: "5" },
  {
    href: "/runs/run_018f2c",
    icon: ActivityIcon,
    label: "Runs",
    badge: "1",
    match: (path) => path.startsWith("/runs/"),
  },
  { href: "/scripts", icon: CodeIcon, label: "Scripts", badge: "43" },
  {
    href: "/runs",
    icon: HistoryIcon,
    label: "Run history",
    match: (path) => path === "/runs",
  },
]

const PROJECT: NavItem[] = [
  { href: "/onboard", icon: SparklesIcon, label: "Onboarding" },
  { href: "/settings", icon: Settings2Icon, label: "Settings" },
]

function ProbeMark() {
  return (
    <div
      aria-hidden
      className="bg-accent relative grid size-[26px] place-items-center rounded-[6px] shadow-[0_0_0_1px_oklch(0.55_0.18_45/0.6),0_2px_8px_oklch(0.55_0.18_45/0.25)]"
    >
      <span className="size-2 rounded-full bg-[oklch(0.98_0.01_60)] shadow-[0_0_0_2px_oklch(0.45_0.15_45)]" />
    </div>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()

  const renderNav = (items: NavItem[]) =>
    items.map((it) => {
      const active = it.match
        ? it.match(pathname)
        : pathname === it.href || pathname.startsWith(it.href + "/")
      const Icon = it.icon
      return (
        <SidebarMenuItem key={it.href}>
          <SidebarMenuButton
            isActive={active}
            onClick={() => router.push(it.href)}
            tooltip={it.label}
            className={cn(
              "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground",
              "hover:bg-sidebar-accent/70"
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
                    : "bg-sidebar-border text-sidebar-foreground/60"
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
          <ProbeMark />
          <div
            className="font-serif text-[22px] leading-none tracking-[-0.01em] text-[oklch(0.97_0.005_80)] group-data-[state=collapsed]:hidden"
            style={{ fontFamily: "var(--font-serif), serif" }}
          >
            Pr<em className="text-accent not-italic italic">o</em>be
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/55 text-[10.5px] tracking-[0.08em] uppercase">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderNav(WORKSPACE)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/55 text-[10.5px] tracking-[0.08em] uppercase">
            Project
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderNav(PROJECT)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter />

      <SidebarRail />
    </Sidebar>
  )
}
