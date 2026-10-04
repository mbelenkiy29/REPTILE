"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog as D } from "radix-ui";
import {
  BookOpen, ChartColumn, Check, ChevronsUpDown, CreditCard, FlaskConical, FolderGit2, History, KeyRound, LogOut, Menu,
  PanelLeft, Plug, Plus, ScrollText, SlidersHorizontal, UserRound, Users, X, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStored, writeStored } from "@/lib/use-stored";
import { resetData, setSim, signOut, switchOrg } from "@/app/actions/session";
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

export interface ShellOrg {
  id: string;
  name: string;
  role: "admin" | "member";
}

export interface ShellProps {
  orgs: ShellOrg[];
  currentOrgId: string;
  user: { name: string; email: string };
  dev?: { sim: "none" | "slow" | "error" } | null;
  children: React.ReactNode;
}

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

function OrgSwitcher({ orgs, currentOrgId, collapsed }: { orgs: ShellOrg[]; currentOrgId: string; collapsed?: boolean }) {
  const current = orgs.find((o) => o.id === currentOrgId) ?? orgs[0];
  const [pending, start] = React.useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-busy={pending || undefined}
          className={cn(
            "mx-3 flex h-9 min-w-0 items-center gap-2 rounded-md px-2 text-left hover:bg-surface focus-visible:outline-2 focus-visible:outline-focus",
            collapsed && "justify-center px-0",
          )}
          aria-label={`Switch organization, current: ${current.name}`}
        >
          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-accent text-xs font-semibold text-on-accent" aria-hidden>
            {current.name.charAt(0).toUpperCase()}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate text-base font-medium text-fg">{current.name}</span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-muted" aria-hidden />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        {orgs.map((o) => (
          <DropdownMenuItem key={o.id} onSelect={() => o.id !== current.id && start(() => switchOrg(o.id))}>
            <span className="min-w-0 flex-1 truncate">{o.name}</span>
            <span className="text-xs text-muted">{o.role === "admin" ? "Admin" : "Member"}</span>
            {o.id === current.id && <Check aria-label="Current" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding/new-org">
            <Plus aria-hidden /> New organization
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DevPanel({ sim, collapsed }: { sim: "none" | "slow" | "error"; collapsed?: boolean }) {
  const [pending, start] = React.useTransition();
  if (collapsed) return null;
  return (
    <div className="mx-3 rounded-md border border-dashed border-border-strong p-2 text-xs">
      <p className="mb-1.5 flex items-center gap-1.5 font-medium text-muted">
        <FlaskConical className="size-3.5" aria-hidden /> Dev data
      </p>
      <label className="flex items-center justify-between gap-2 text-muted">
        Data layer
        <select
          className="h-6 rounded-sm border border-border-input bg-bg px-1 text-xs text-fg"
          value={sim}
          disabled={pending}
          onChange={(e) => start(() => setSim(e.target.value as "none" | "slow" | "error"))}
        >
          <option value="none">Normal</option>
          <option value="slow">Slow (1.5s)</option>
          <option value="error">Failing</option>
        </select>
      </label>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const url = await resetData();
            if (url) window.location.assign(url);
          })
        }
        className="mt-1.5 text-accent underline-offset-2 hover:underline disabled:opacity-50"
      >
        Reset seed data
      </button>
    </div>
  );
}

function UserMenu({ user }: { user: { name: string; email: string } }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="grid size-7 place-items-center rounded-pill bg-surface-sunken text-xs font-semibold text-fg hover:bg-surface focus-visible:outline-2 focus-visible:outline-focus"
          aria-label={`Account menu for ${user.name}`}
        >
          {user.name.charAt(0)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        <DropdownMenuLabel>
          <span className="block truncate text-sm font-medium text-fg">{user.name}</span>
          <span className="block truncate">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/account"><UserRound aria-hidden /> Your account</Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => signOut()}>
          <LogOut aria-hidden /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ orgs, currentOrgId, user, dev, children }: ShellProps) {
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
          "sticky top-0 hidden h-dvh shrink-0 flex-col gap-3 overflow-y-auto border-r bg-bg py-3 lg:flex",
          collapsed ? "w-[var(--layout-sidebar-collapsed)]" : "w-[var(--layout-sidebar)]",
        )}
      >
        <OrgSwitcher orgs={orgs} currentOrgId={currentOrgId} collapsed={collapsed} />
        <NavLinks collapsed={collapsed} />
        <div className="mt-auto flex flex-col gap-3">
          {dev && <DevPanel sim={dev.sim} collapsed={collapsed} />}
          <div className={cn("px-3", collapsed && "flex justify-center")}>
            <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
              <PanelLeft aria-hidden />
            </Button>
          </div>
        </div>
      </aside>

      <D.Root open={drawer} onOpenChange={setDrawer}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-[var(--z-modal)] bg-overlay/50 lg:hidden" />
          <D.Content className="fixed inset-y-0 left-0 z-[var(--z-modal)] flex w-[280px] max-w-[85vw] flex-col gap-3 overflow-y-auto border-r bg-bg py-3 shadow-pop lg:hidden">
            <D.Title className="sr-only">Navigation</D.Title>
            <D.Description className="sr-only">Main navigation and settings</D.Description>
            <div className="flex items-center justify-between pr-3">
              <OrgSwitcher orgs={orgs} currentOrgId={currentOrgId} />
              <D.Close asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Close navigation">
                  <X aria-hidden />
                </Button>
              </D.Close>
            </div>
            <NavLinks onNavigate={() => setDrawer(false)} />
            {dev && <div className="mt-auto"><DevPanel sim={dev.sim} /></div>}
          </D.Content>
        </D.Portal>
      </D.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-[var(--z-sticky)] flex h-[var(--layout-header)] items-center gap-2 border-b bg-bg/90 px-4 backdrop-blur">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setDrawer(true)} aria-label="Open navigation">
            <Menu aria-hidden />
          </Button>
          <Link href="/repos" className="text-md font-semibold tracking-tight text-fg lg:hidden">
            REPTILE
          </Link>
          <div className="flex-1" />
          <ThemeToggle />
          <UserMenu user={user} />
        </header>
        <main id="content" tabIndex={-1} className="mx-auto w-full max-w-[var(--layout-content-max)] flex-1 px-4 py-6 focus:outline-none md:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
