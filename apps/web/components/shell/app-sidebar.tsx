"use client"

import { usePathname, useRouter } from "next/navigation"
import {
  ActivityIcon,
  BellIcon,
  ChevronsUpDownIcon,
  CodeIcon,
  DatabaseIcon,
  FlaskConicalIcon,
  GaugeIcon,
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

const OBSERVABILITY: NavItem[] = [
  { href: "/cost", icon: GaugeIcon, label: "Cost & usage" },
  { href: "/traces", icon: DatabaseIcon, label: "Langfuse traces" },
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

        <button
          type="button"
          className="bg-sidebar-accent/60 border-sidebar-border hover:bg-sidebar-accent mt-1 flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-left group-data-[state=collapsed]:hidden"
        >
          <span className="grid size-[22px] place-items-center rounded-[5px] bg-gradient-to-br from-[oklch(0.65_0.15_200)] to-[oklch(0.55_0.15_280)] font-mono text-[11px] font-semibold text-white">
            AC
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-medium text-[oklch(0.96_0.005_80)]">
              acme/shop
            </span>
            <span className="text-sidebar-foreground/60 block truncate text-[11px]">
              staging.acme.shop
            </span>
          </span>
          <ChevronsUpDownIcon className="text-sidebar-foreground/50 size-[13px]" />
        </button>
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

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/55 text-[10.5px] tracking-[0.08em] uppercase">
            Observability
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderNav(OBSERVABILITY)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="border-sidebar-border flex items-center gap-2.5 border-t px-2 pt-3 group-data-[state=collapsed]:hidden">
          <span className="grid size-[26px] place-items-center rounded-full bg-gradient-to-br from-[oklch(0.7_0.12_30)] to-[oklch(0.55_0.15_350)] font-mono text-[11px] font-semibold text-white">
            MC
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[12.5px] text-[oklch(0.96_0.005_80)]">
              Mira Chen
            </div>
            <div className="text-sidebar-foreground/55 truncate font-mono text-[10.5px]">
              mira@acme.co
            </div>
          </div>
          <BellIcon className="text-sidebar-foreground/55 size-[14px]" />
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
