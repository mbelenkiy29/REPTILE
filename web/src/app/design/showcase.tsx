"use client";
import * as React from "react";
import { FolderGit2, Inbox, MoreHorizontal, Plus, ScrollText, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Alert } from "@/components/ui/alert";
import { Badge, ConfidenceScore, SeverityBadge, StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, StatTile, UsageMeter } from "@/components/ui/card";
import { ChipInput } from "@/components/ui/chip-input";
import { CodeBlock } from "@/components/ui/code-block";
import { ConfirmDialog, Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ProviderCard } from "@/components/ui/provider-card";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableEmpty, TableSkeleton, TD, TH, THead, TRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 border-t pt-6 first:border-t-0 first:pt-0">
      <h2 id={id} className="text-lg text-fg">
        {title}
      </h2>
      {children}
    </section>
  );
}

const Row = ({ children }: { children: React.ReactNode }) => <div className="flex flex-wrap items-center gap-3">{children}</div>;

const swatches = [
  "bg", "surface", "surface-sunken", "border", "border-strong", "border-input", "text", "text-muted",
  "accent", "accent-hover", "accent-soft", "danger", "danger-soft", "warning", "warning-soft",
  "success", "success-soft", "info", "info-soft",
];

const strictnessHelp = {
  "1": "Verbose: flags everything, including style nits.",
  "2": "Balanced: bugs and meaningful quality issues. The default.",
  "3": "Critical only: just the things that would break production.",
};

const repos = [
  { name: "acme/api", status: "completed" as const, on: true, reviews: 128, sha: "9f2c1ab" },
  { name: "acme/web", status: "indexing" as const, on: true, reviews: 0, sha: "—" },
  { name: "acme/infra", status: "failed" as const, on: true, reviews: 12, sha: "41be07d" },
  { name: "acme/legacy-billing", status: "disabled" as const, on: false, reviews: 3, sha: "c0ffee1" },
];

export function Showcase() {
  const [strictness, setStrictness] = React.useState<"1" | "2" | "3">("2");
  const [labels, setLabels] = React.useState(["needs-review", "backend"]);
  const [globs, setGlobs] = React.useState<string[]>([]);
  const [role, setRole] = React.useState("member");
  const [on, setOn] = React.useState(repos.map((r) => r.on));
  const [loading, setLoading] = React.useState(false);
  const [sort, setSort] = React.useState<"asc" | "desc">("asc");

  return (
    <AppShell
      title="Design system"
      actions={
        <Button size="sm" onClick={() => toast.success("Settings saved")}>
          Fire a toast
        </Button>
      }
    >
      <div className="flex flex-col gap-10">
        <p className="max-w-[var(--layout-form-max)] text-muted">
          Every primitive in its states, built from <code className="text-fg">replica/design/tokens.json</code>. Use the theme
          button in the header to check dark mode. This page is for development only.
        </p>

        <Section id="colour" title="Colour roles">
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {swatches.map((s) => (
              <li key={s} className="flex items-center gap-2 text-sm">
                <span className="size-8 shrink-0 rounded-md border" style={{ background: `var(--c-${s})` }} />
                <span className="font-mono text-xs text-muted">{s}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="type" title="Type">
          <div className="flex flex-col gap-2">
            <p className="text-display">Display 44</p>
            <p className="text-xl">Heading xl 28</p>
            <p className="text-lg">Heading lg 20</p>
            <p className="text-md">Title md 16</p>
            <p className="text-base">Body base 14: the review found two issues in the payment retry path.</p>
            <p className="text-sm text-muted">Small sm 13: secondary text, hints, table meta.</p>
            <p className="text-xs text-muted">Caption xs 12</p>
            <p className="font-mono text-sm">mono 13: 9f2c1ab · src/billing/retry.ts:42</p>
          </div>
        </Section>

        <Section id="buttons" title="Button">
          <Row>
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Delete</Button>
            <Button variant="link">Link</Button>
          </Row>
          <Row>
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" variant="secondary" aria-label="Add">
              <Plus aria-hidden />
            </Button>
            <Button disabled>Disabled</Button>
            <Button
              loading={loading}
              onClick={() => {
                setLoading(true);
                setTimeout(() => setLoading(false), 1500);
              }}
            >
              {loading ? "Saving" : "Click to load"}
            </Button>
          </Row>
        </Section>

        <Section id="forms" title="Form controls">
          <div className="grid max-w-[var(--layout-form-max)] gap-5">
            <Field label="Organization name" hint="Shown to your team and on invoices.">
              {(p) => <Input {...p} defaultValue="Acme" />}
            </Field>
            <Field label="Email" error="Enter an email address, like dev@acme.com.">
              {(p) => <Input {...p} type="email" defaultValue="dev@" />}
            </Field>
            <Field label="Rule" optional hint="Plain English. It's checked on every review in scope.">
              {(p) => <Textarea {...p} placeholder="Don't call the database from React components; go through a server action." />}
            </Field>
            <Field label="Disabled">{(p) => <Input {...p} disabled value="Read only while syncing" readOnly />}</Field>
            <Field label="Role">{(p) => (
              <Select
                {...p}
                value={role}
                onValueChange={setRole}
                options={[
                  { value: "member", label: "Member" },
                  { value: "admin", label: "Admin" },
                ]}
              />
            )}</Field>
            <Field label="Review only PRs with these labels" hint="Press Enter or comma to add. Leave empty to review every PR.">
              {(p) => <ChipInput {...p} value={labels} onChange={setLabels} placeholder="needs-review" />}
            </Field>
            <Field label="Ignore these paths" hint="Glob patterns, like **/*.generated.ts">
              {(p) => (
                <ChipInput
                  {...p}
                  value={globs}
                  onChange={setGlobs}
                  placeholder="dist/**"
                  validate={(v) => (v.includes(" ") ? "Globs can't contain spaces." : undefined)}
                />
              )}
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-fg" id="strictness-label">
                Strictness
              </span>
              <Segmented
                label="Strictness"
                value={strictness}
                onValueChange={setStrictness}
                options={[
                  { value: "1", label: "1" },
                  { value: "2", label: "2" },
                  { value: "3", label: "3" },
                ]}
              />
              <p className="text-sm text-muted">{strictnessHelp[strictness]}</p>
            </div>
            <Row>
              <Switch defaultChecked aria-label="Review draft pull requests" id="sw1" />
              <label htmlFor="sw1" className="text-base">Review draft pull requests</label>
            </Row>
            <Row>
              <Switch disabled aria-label="Disabled switch" />
              <span className="text-base text-muted">Disabled</span>
              <Switch saving defaultChecked aria-label="Saving switch" />
              <span className="text-base text-muted">Saving</span>
            </Row>
          </div>
        </Section>

        <Section id="status" title="Status, severity, confidence">
          <Row>
            <StatusPill status="queued" />
            <StatusPill status="indexing" />
            <StatusPill status="running" />
            <StatusPill status="completed" />
            <StatusPill status="failed" />
            <StatusPill status="skipped" reason="Draft pull request" />
            <StatusPill status="disabled" />
            <StatusPill status="superseded" />
          </Row>
          <Row>
            <SeverityBadge severity="P0" showWord />
            <SeverityBadge severity="P1" showWord />
            <SeverityBadge severity="P2" showWord />
            <SeverityBadge severity="P0" />
            <Badge tone="accent">Learned</Badge>
            <Badge>Manual</Badge>
          </Row>
          <Row>
            <ConfidenceScore score={2} />
            <ConfidenceScore score={3} />
            <ConfidenceScore score={5} />
          </Row>
        </Section>

        <Section id="table" title="Data table">
          <Table>
            <THead>
              <tr>
                <TH sort={sort} onSort={() => setSort(sort === "asc" ? "desc" : "asc")}>Repository</TH>
                <TH>Index</TH>
                <TH numeric>Reviews</TH>
                <TH>Indexed at</TH>
                <TH>Review PRs</TH>
                <TH><span className="sr-only">Actions</span></TH>
              </tr>
            </THead>
            <tbody>
              {[...repos].sort((a, b) => (sort === "asc" ? 1 : -1) * a.name.localeCompare(b.name)).map((r) => {
                const i = repos.indexOf(r);
                return (
                  <TRow key={r.name}>
                    <TD className="font-medium">{r.name}</TD>
                    <TD>
                      <StatusPill status={on[i] ? r.status : "disabled"} />
                    </TD>
                    <TD numeric>{r.reviews}</TD>
                    <TD className="font-mono text-sm text-muted">{r.sha}</TD>
                    <TD>
                      <Switch
                        checked={on[i]}
                        onCheckedChange={(v) => {
                          setOn(on.map((x, j) => (j === i ? v : x)));
                          toast.success(`${v ? "Reviewing" : "Stopped reviewing"} ${r.name}`);
                        }}
                        aria-label={`Review pull requests in ${r.name}`}
                      />
                    </TD>
                    <TD className="w-10">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${r.name}`}>
                            <MoreHorizontal aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem>Re-index</DropdownMenuItem>
                          <DropdownMenuItem>Open on GitHub</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem destructive>
                            <Trash2 aria-hidden /> Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TD>
                  </TRow>
                );
              })}
            </tbody>
          </Table>
          <div className="grid gap-4 lg:grid-cols-2">
            <Table aria-label="Loading example">
              <THead>
                <tr>
                  <TH>Repository</TH>
                  <TH>Index</TH>
                  <TH numeric>Reviews</TH>
                </tr>
              </THead>
              <tbody aria-busy>
                <TableSkeleton cols={3} rows={3} />
              </tbody>
            </Table>
            <Table aria-label="Empty example">
              <THead>
                <tr>
                  <TH>Repository</TH>
                  <TH>Index</TH>
                </tr>
              </THead>
              <tbody>
                <TableEmpty cols={2}>
                  <EmptyState
                    icon={FolderGit2}
                    title="No repositories yet"
                    body="Install the GitHub App on an org to start reviewing pull requests."
                    action={<Button size="sm">Connect GitHub</Button>}
                  />
                </TableEmpty>
              </tbody>
            </Table>
          </div>
        </Section>

        <Section id="cards" title="Cards, stats, usage">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="PRs reviewed" value="1,284" delta={12} />
            <StatTile label="Comments addressed" value="61%" delta={4} />
            <StatTile label="Median time to merge" value="7.2 h" delta={-9} goodWhen="down" />
            <StatTile label="Critical bugs caught" loading />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Usage this month" description="Resets on Nov 1">
              <div className="flex flex-col gap-5">
                <UsageMeter label="Reviews" used={312} included={400} />
                <UsageMeter label="Reviews (over)" used={436} included={400} />
              </div>
            </Card>
            <Card
              title="Rules"
              actions={<Button size="sm" variant="secondary"><Plus aria-hidden /> Add rule</Button>}
            >
              <EmptyState
                icon={ScrollText}
                title="No rules yet"
                body="Write a rule in plain English and it gets checked on every review."
                className="py-6"
              />
            </Card>
          </div>
        </Section>

        <Section id="alerts" title="Alerts">
          <Alert variant="info" title="Indexing acme/web">Reviews use the full codebase once indexing finishes, in about 4 minutes.</Alert>
          <Alert variant="success" title="GitHub connected">12 repositories are ready for review.</Alert>
          <Alert variant="warning" title="Your trial ends in 3 days" action={<Button size="sm">Choose a plan</Button>}>
            Reviews pause when it ends. Your settings and rules stay.
          </Alert>
          <Alert variant="danger" title="Indexing failed for acme/infra" action={<Button size="sm" variant="secondary">Retry</Button>}>
            The clone timed out after 10 minutes. Large binary files can cause this; add them to ignore patterns.
          </Alert>
        </Section>

        <Section id="overlays" title="Dialogs, menus, tabs">
          <Row>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="secondary">Invite member</Button>
              </DialogTrigger>
              <DialogContent
                title="Invite a teammate"
                description="They'll get an email with a link that expires in 7 days."
                footer={
                  <>
                    <DialogClose asChild>
                      <Button variant="secondary">Cancel</Button>
                    </DialogClose>
                    <Button onClick={() => toast.success("Invite sent")}>Send invite</Button>
                  </>
                }
              >
                <div className="grid gap-4">
                  <Field label="Email">{(p) => <Input {...p} type="email" placeholder="dev@acme.com" />}</Field>
                </div>
              </DialogContent>
            </Dialog>
            <ConfirmDialog
              trigger={<Button variant="danger">Revoke key</Button>}
              title="Revoke this API key?"
              description="Anything using it stops working right away. This can't be undone."
              confirmLabel="Revoke key"
              onConfirm={() => {
                toast.success("Key revoked");
              }}
            />
          </Row>
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="reviews">Reviews</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
              <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="text-muted">Index status, last indexed commit and recent reviews.</TabsContent>
            <TabsContent value="reviews" className="text-muted">Review history for this repository.</TabsContent>
            <TabsContent value="settings" className="text-muted">Overrides for this repository.</TabsContent>
            <TabsContent value="knowledge">
              <EmptyState icon={Inbox} title="Nothing generated yet" body="The knowledge base is written after the first full index." />
            </TabsContent>
          </Tabs>
        </Section>

        <Section id="providers" title="Providers">
          <div className="grid gap-4 md:grid-cols-3">
            <ProviderCard name="GitHub" description="Review pull requests on github.com." state="connected" account="acme" />
            <ProviderCard name="GitHub" description="Review pull requests on github.com." state="error" error="The app was uninstalled from this org." />
            <ProviderCard name="GitLab" description="Review merge requests on gitlab.com." state="soon" />
          </div>
        </Section>

        <Section id="code" title="Code">
          <CodeBlock
            title="reptile.json"
            code={JSON.stringify({ strictness: 2, commentTypes: ["logic", "syntax"], ignorePatterns: ["dist/**"] }, null, 2)}
          />
        </Section>

        <Section id="skeleton" title="Skeleton">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        </Section>
      </div>
    </AppShell>
  );
}
