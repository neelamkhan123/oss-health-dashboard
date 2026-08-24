import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  Separator,
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Avatar,
  AvatarFallback,
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from "@neelamkhan21/ui";
import {
  LayoutDashboard,
  Activity,
  Folder,
  Calendar,
  Zap,
  Bell,
  User,
  Settings,
  LogOut,
} from "lucide-react";
import type { MouseEvent, ReactNode } from "react";

const TRACKED_REPOS = ["facebook/react", "vuejs/core", "microsoft/vscode"];

function pageTitle(pathname: string): string {
  if (pathname === "/") return "Overview";
  if (pathname === "/compare") return "Compare";
  if (pathname.startsWith("/repos/")) {
    const repo = decodeURIComponent(pathname.slice("/repos/".length));
    return repo.split("/")[1] ?? repo;
  }
  return "OSS Health";
}

export function AppShell() {
  const location = useLocation();

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <span className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-950 dark:text-white">
            <span className="flex size-5 items-center justify-center rounded bg-slate-950 text-white dark:bg-white dark:text-slate-950">
              N
            </span>
            OSS Health
          </span>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Views</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarNavButton to="/" icon={<LayoutDashboard size={16} />}>
                  Overview
                </SidebarNavButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarNavButton to="/compare" icon={<Activity size={16} />}>
                  Compare
                </SidebarNavButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Tracked repos</SidebarGroupLabel>
            <SidebarMenu>
              {TRACKED_REPOS.map((repo) => (
                <SidebarMenuItem key={repo}>
                  <SidebarNavButton
                    to={`/repos/${encodeURIComponent(repo)}`}
                    icon={<Folder size={16} />}
                  >
                    {repo.split("/")[1]}
                  </SidebarNavButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <div className="flex items-center gap-2.5 p-1">
            <Avatar size="sm">
              <AvatarFallback>NK</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium text-slate-950 dark:text-white">
                Neelam Khan
              </span>
              <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                Admin
              </span>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>

      <div className="flex min-w-0 flex-1 flex-col bg-slate-50 dark:bg-slate-900">
        <Topbar trail={pageTitle(location.pathname)} />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  );
}

function Topbar({ trail }: { trail: string }) {
  const [accountOpen, setAccountOpen] = useState(false);
  const navigate = useNavigate();

  const handleHomeClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    e.preventDefault();
    navigate("/");
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-6 dark:border-slate-800 dark:bg-slate-950">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-5" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/" onClick={handleHomeClick}>
              OSS Health
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{trail}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex-1" />
      <Button variant="outline" size="sm" icon={<Calendar size={14} />}>
        Last 90 days
      </Button>
      <Button size="sm" icon={<Zap size={14} />}>
        Sync now
      </Button>
      <Button variant="ghost" size="icon" aria-label="Notifications">
        <Bell size={16} />
      </Button>
      <DropdownMenu open={accountOpen} onOpenChange={setAccountOpen}>
        <DropdownMenuTrigger
          aria-label="Account"
          className="rounded-full border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 dark:focus-visible:ring-white"
        >
          <Avatar size="sm">
            <AvatarFallback>NK</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>neelam@acme.co</DropdownMenuLabel>
          <DropdownMenuItem>
            <User size={14} /> Profile
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Settings size={14} /> Settings
            <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive">
            <LogOut size={14} /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

// SidebarMenuButton always renders a real <a href>, so it can't be nested
// inside react-router's <NavLink> (which renders its own <a>) — that
// produces an invalid <a> inside <a> and a hydration error. Instead, compute
// active state from the current location and drive navigation from
// onClick, the same way any real anchor integrates with client-side routing.
function SidebarNavButton({
  to,
  icon,
  children,
}: {
  to: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = location.pathname === to;

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return; // let the browser handle new-tab/new-window clicks normally
    }
    e.preventDefault();
    navigate(to);
  };

  return (
    <SidebarMenuButton href={to} icon={icon} isActive={isActive} onClick={handleClick}>
      {children}
    </SidebarMenuButton>
  );
}
