import { AppSidebar } from "@/components/shell/app-sidebar"
import { Topbar } from "@/components/shell/topbar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider style={{ "--sidebar-width": "232px" } as React.CSSProperties}>
      <AppSidebar />
      <SidebarInset className="flex h-svh min-w-0 flex-col">
        <Topbar />
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
