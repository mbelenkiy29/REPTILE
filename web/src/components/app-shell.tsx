"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog as D } from "radix-ui";
import {
  BookOpen, ChartColumn, ChevronsUpDown, CreditCard, FolderGit2, History, KeyRound, Menu,
  PanelLeft, Plug, ScrollText, SlidersHorizontal, Users, X, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStored, writeStored } from "@/lib/use-stored";
import { Button } from "./ui/button";
import { ThemeToggle } from "./ui/theme-toggle";
import { Tooltip } from "./ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type NavItem = { href: string; label: string; icon: LucideIcon };
const main: NavItem[] = [
  { href: "/repos", label: "Repositories", icon: FolderGit2 },
  { href: "/reviews", label: "Reviews", icon: History },
  { href: "/rules", label: "Rules", icon: ScrollText },
  { href: "/analytics", label: "Analytics", icon: ChartColumn },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen },
];
const settings: NavItem[] = [
  { href: "/settings/review", label: "Review settings", icon: SlidersHorizontal },
  { href: "/settings/members", label: "Members", icon: Users },
  { href: "/settings/billing", label: "Billing", icon: CreditCard },
  { href: "/settings/api-keys", label: "API keys", icon: KeyRound },
  { href: "/settings/integrations", label: "Integrations", icon: Plug },
];

function NavLinks({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const path = usePathname();
  const link = (item: NavItem) => {
    const active = path === item.href || path.startsWith(item.href + "/");
    const a = (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        aria-label={collapsed ? item.label : undefined}
        className={cn(
          "relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-base text-muted transition-colors hover:bg-surface hover:text-fg",
          "focus-visible:outline-2 focus-visible:outline-focus",
          active && "bg-surface font-medium text-fg before:absolute before:inset-y-1.5 before:-left-2 before:w-0.5 before:rounded-pill before:bg-accent",
          collapsed && "justify-center px-0",
        )}
      >
        <item.icon className="size-4 shrink-0" aria-hidden />
        {!collapsed && item.label}
      </Link>
    );
    return collapsed ? (
      <Tooltip key={item.href} content={item.label}>
        {a}
      </Tooltip>
    ) : (
      a
    );
  };
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5 px-3">
      {main.map(link)}
      <p className={cn("mb-1 mt-5 px-2.5 text-xs text-muted", collapsed && "sr-only")}>Settings</p>
      {settings.map(link)}
    </nav>
  );
}

function OrgSwitcher({ collapsed }: { collapsed?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "mx-3 flex h-9 items-center gap-2 rounded-md px-2 text-left hover:bg-surface focus-visible:outline-2 focus-visible:outline-focus",
            collapsed && "justify-center px-0",
          )}
          aria-label="Switch organization, current: Acme"
        >
          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-accent text-xs font-semibold text-on-accent">A</span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate text-base font-medium text-fg">Acme</span>
              <ChevronsUpDown className="size-3.5 text-muted" aria-hidden />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        <DropdownMenuItem>Acme</DropdownMenuItem>
        <DropdownMenuItem>Side project</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>New organization</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  const collapsed = useStored("sidebar") === "collapsed";
  const [drawer, setDrawer] = React.useState(false);
  const toggle = () => writeStored("sidebar", collapsed ? null : "collapsed");

  return (
    <div className="flex min-h-dvh">
      <a
        href="#content"
        className="sr-only z-[var(--z-toast)] rounded-md bg-bg px-3 py-2 focus:not-sr-only focus:fixed focus:left-2 focus:top-2"
      >
        Skip to content
      </a>

      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col gap-3 border-r bg-bg py-3 lg:flex",
          collapsed ? "w-[var(--layout-sidebar-collapsed)]" : "w-[var(--layout-sidebar)]",
        )}
      >
        <OrgSwitcher collapsed={collapsed} />
        <NavLinks collapsed={collapsed} />
        <div className={cn("mt-auto px-3", collapsed && "flex justify-center")}>
          <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            <PanelLeft aria-hidden />
          </Button>
        </div>
      </aside>

      <D.Root open={drawer} onOpenChange={setDrawer}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-[var(--z-modal)] bg-overlay/50 lg:hidden" />
          <D.Content className="fixed inset-y-0 left-0 z-[var(--z-modal)] flex w-[280px] max-w-[85vw] flex-col gap-3 border-r bg-bg py-3 shadow-pop lg:hidden">
            <D.Title className="sr-only">Navigation</D.Title>
            <D.Description className="sr-only">Main navigation and settings</D.Description>
            <div className="flex items-center justify-between pr-3">
              <OrgSwitcher />
              <D.Close asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Close navigation">
                  <X aria-hidden />
                </Button>
              </D.Close>
            </div>
            <NavLinks onNavigate={() => setDrawer(false)} />
          </D.Content>
        </D.Portal>
      </D.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-[var(--z-sticky)] flex h-[var(--layout-header)] items-center gap-2 border-b bg-bg/90 px-4 backdrop-blur">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setDrawer(true)} aria-label="Open navigation">
            <Menu aria-hidden />
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-md font-semibold text-fg">{title}</h1>
          {actions}
          <ThemeToggle />
          <span className="grid size-7 place-items-center rounded-pill bg-surface-sunken text-xs font-semibold text-fg" aria-label="Signed in as Jordan">
            J
          </span>
        </header>
        <main id="content" tabIndex={-1} className="mx-auto w-full max-w-[var(--layout-content-max)] flex-1 px-4 py-6 focus:outline-none md:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
