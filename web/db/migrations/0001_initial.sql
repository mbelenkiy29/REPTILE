-- REPTILE schema v1 (Postgres 16 + pgvector). First migration.
-- Conventions: uuid ids, timestamptz in UTC, every owned row carries org_id,
-- on-delete rules chosen explicitly, an index on every FK and every filter/sort column.
-- Access: data-layer authorisation (see architecture.md). RLS is enabled with
-- no policies as a deny-all backstop for any non-owner role (e.g. a leaked anon key).

create extension if not exists pgcrypto;
create extension if not exists vector;
create extension if not exists citext;

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ───────────────────────── auth (Auth.js / Drizzle adapter shape) ─────────────────────────

create table users (
  id uuid primary key default gen_random_uuid(),
  email citext unique,
  name text,
  image text,
  github_login text unique,                 -- used to match PR authors / reactors to members
  email_verified timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table accounts (                     -- OAuth links (GitHub; later GitLab/Google)
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null,
  provider text not null,
  provider_account_id text not null,
  access_token text,                        -- encrypted at rest by the app (AES-GCM, key in env)
  refresh_token text,
  expires_at bigint,
  token_type text,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_account_id)
);
create index on accounts (user_id);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  session_token text not null unique,
  user_id uuid not null references users(id) on delete cascade,
  expires timestamptz not null
);
create index on sessions (user_id);

create table verification_tokens (
  identifier text not null,
  token text not null,
  expires timestamptz not null,
  primary key (identifier, token)
);

-- ───────────────────────── tenancy ─────────────────────────

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext not null unique,
  plan text not null default 'trial' check (plan in ('free','trial','pro','enterprise')),
  trial_ends_at timestamptz,
  included_reviews_per_seat int not null default 50 check (included_reviews_per_seat >= 0),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  billing_status text not null default 'none'
    check (billing_status in ('none','active','past_due','canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table memberships (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin','member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index on memberships (user_id);

create table invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  email citext not null,
  role text not null default 'member' check (role in ('admin','member')),
  token_hash text not null unique,          -- sha256 of the emailed token
  invited_by uuid references users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on invites (org_id);
create unique index invites_one_open_per_email on invites (org_id, email) where accepted_at is null;

-- "Team" in the recon: one per linked GitHub org / user account.
create table installations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  provider text not null default 'github' check (provider in ('github','gitlab','ghe')),
  external_installation_id bigint not null,
  account_login text not null,
  account_type text not null check (account_type in ('User','Organization')),
  repository_selection text not null default 'selected' check (repository_selection in ('all','selected')),
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_installation_id)
);
create index on installations (org_id);

-- ───────────────────────── repos & indexing ─────────────────────────

create table repositories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  installation_id uuid not null references installations(id) on delete cascade,
  provider_repo_id bigint not null,
  full_name text not null,                  -- owner/name; can change on rename, provider id is stable
  default_branch text not null default 'main',
  private boolean not null default true,
  review_enabled boolean not null default true,
  index_status text not null default 'submitted'
    check (index_status in ('submitted','cloning','processing','completed','failed')),
  index_error text,
  indexed_sha text,
  files_indexed int not null default 0,
  last_indexed_at timestamptz,
  removed_at timestamptz,                   -- removed from the installation; purge job deletes data later
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (installation_id, provider_repo_id)
);
create index on repositories (org_id, full_name);
create index on repositories (index_status) where index_status <> 'completed';

create table code_chunks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  repo_id uuid not null references repositories(id) on delete cascade,
  path text not null,
  symbol text,                              -- function/class name when the chunker found one
  start_line int not null,
  end_line int not null,
  content_hash text not null,               -- skip re-embedding unchanged chunks
  content text not null,
  embedding vector(1024) not null,          -- voyage-code-3 default dimension
  created_at timestamptz not null default now(),
  constraint chunk_lines check (end_line >= start_line)
);
create index on code_chunks (repo_id, path);
create unique index on code_chunks (repo_id, path, start_line, content_hash);
create index on code_chunks using hnsw (embedding vector_cosine_ops);

create table knowledge_docs (               -- could-have: per-repo knowledge base
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  repo_id uuid not null references repositories(id) on delete cascade,
  path text not null,                       -- 'index' | 'area/<name>' | 'reverts'
  title text not null,
  body_md text not null,
  generated_sha text,
  edited_by uuid references users(id) on delete set null,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (repo_id, path)
);

-- ───────────────────────── config & rules ─────────────────────────

-- Dashboard config: one org default (repo_id null) and optional per-repo override.
-- Repo files (reptile.json, .reptile/config.json) are read at review time and
-- snapshotted into reviews.effective_config. Precedence: path file > repo file > repo row > org row.
create table review_configs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  repo_id uuid references repositories(id) on delete cascade,
  strictness smallint not null default 2 check (strictness between 1 and 3),
  comment_types text[] not null default '{logic,syntax,style}'
    check (comment_types <@ array['logic','syntax','style','security']::text[]),
  review_drafts boolean not null default false,
  include_labels text[] not null default '{}',
  disabled_labels text[] not null default '{}',
  include_authors text[] not null default '{}',
  exclude_authors text[] not null default '{}',
  include_branches text[] not null default '{}',
  exclude_branches text[] not null default '{}',
  ignore_patterns text[] not null default '{}',
  summary_options jsonb not null default '{"diagram": true, "fileTable": true, "confidence": true}',
  updated_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index review_configs_org_default on review_configs (org_id) where repo_id is null;
create unique index review_configs_repo on review_configs (repo_id) where repo_id is not null;

create table rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  text text not null check (length(text) between 3 and 4000),
  kind text not null default 'rule' check (kind in ('rule','style_guide','doc')),
  source text not null default 'manual' check (source in ('manual','learned','file')),
  status text not null default 'active' check (status in ('active','suggested','disabled')),
  repo_ids uuid[] not null default '{}',    -- empty = all repos
  path_globs text[] not null default '{}',  -- empty = all paths
  evidence jsonb not null default '[]',     -- learned rules: links to the comments/reactions behind them
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on rules (org_id, status);

-- ───────────────────────── PRs, reviews, findings ─────────────────────────

create table pull_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  repo_id uuid not null references repositories(id) on delete cascade,
  number int not null,
  title text not null,
  author_login text not null,
  base_branch text not null,
  head_sha text not null,
  state text not null default 'open' check (state in ('open','closed','merged')),
  is_draft boolean not null default false,
  labels text[] not null default '{}',
  url text not null,
  summary_comment_id bigint,                -- the one summary comment we keep editing
  opened_at timestamptz not null,
  merged_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (repo_id, number)
);
create index on pull_requests (org_id, opened_at desc);
create index on pull_requests (org_id, author_login);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  pull_request_id uuid not null references pull_requests(id) on delete cascade,
  head_sha text not null,
  trigger text not null check (trigger in ('opened','synchronize','ready_for_review','labeled','mention','manual','api','cli')),
  triggered_by text,                        -- GitHub login or user id
  status text not null default 'queued'
    check (status in ('queued','running','completed','failed','skipped','superseded')),
  skip_reason text,                         -- 'draft','author_excluded','branch_excluded','only_ignored_files','no_credits',...
  error text,
  tier text not null default 'standard' check (tier in ('standard','deep')),
  confidence_score smallint check (confidence_score between 1 and 5),
  verdict text,
  summary_md text,
  diagram_mermaid text,
  effective_config jsonb,                   -- merged config used, for "why did it do that"
  check_run_id bigint,
  credits_used smallint not null default 0 check (credits_used >= 0),
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on reviews (pull_request_id, created_at desc);
create index on reviews (org_id, created_at desc);
create index on reviews (status) where status in ('queued','running');
-- At most one live review per PR; a new push supersedes the old one.
create unique index reviews_one_active_per_pr on reviews (pull_request_id) where status in ('queued','running');
-- The same SHA is never reviewed twice by automatic triggers.
create unique index reviews_once_per_sha_auto on reviews (pull_request_id, head_sha)
  where trigger in ('opened','synchronize','ready_for_review') and status <> 'superseded';

-- A finding lives on the PR across reviews ("unresolved findings stay until resolved").
create table findings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  pull_request_id uuid not null references pull_requests(id) on delete cascade,
  first_review_id uuid not null references reviews(id) on delete cascade,
  last_seen_review_id uuid not null references reviews(id) on delete cascade,
  fingerprint text not null,                -- hash(path, normalised title, code anchor) for cross-review matching
  file_path text not null,
  line_start int not null,
  line_end int not null,
  in_diff boolean not null default true,    -- false = outside changed code, goes in the summary only
  severity text not null check (severity in ('P0','P1','P2')),
  type text not null check (type in ('logic','syntax','style','security')),
  title text not null,
  body_md text not null,
  suggestion text,                          -- replacement lines for a ```suggestion block
  rule_id uuid references rules(id) on delete set null,
  provider_comment_id bigint,
  status text not null default 'open' check (status in ('open','addressed','resolved','dismissed')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pull_request_id, fingerprint),
  constraint finding_lines check (line_end >= line_start)
);
create index on findings (first_review_id);
create index on findings (last_seen_review_id);
create index on findings (rule_id);
create index on findings (org_id, created_at desc);
create index on findings (org_id, status, severity);
create index on findings (provider_comment_id) where provider_comment_id is not null;

create table feedback (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  finding_id uuid not null references findings(id) on delete cascade,
  actor_login text not null,
  kind text not null check (kind in ('thumbs_up','thumbs_down','reply','human_comment')),
  body text,
  provider_id bigint,                       -- reaction / comment id on GitHub
  created_at timestamptz not null default now()
);
create index on feedback (finding_id);
create index on feedback (org_id, created_at desc);
create unique index feedback_one_reaction on feedback (finding_id, actor_login, kind)
  where kind in ('thumbs_up','thumbs_down');

-- ───────────────────────── billing, keys, integrations, plumbing ─────────────────────────

create table usage_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  review_id uuid unique references reviews(id) on delete set null,  -- one charge per review
  credits smallint not null check (credits > 0),
  period_start date not null,               -- billing month, UTC
  reported_to_stripe_at timestamptz,
  created_at timestamptz not null default now()
);
create index on usage_events (org_id, period_start);
create index on usage_events (reported_to_stripe_at) where reported_to_stripe_at is null;

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  prefix text not null,                     -- first 8 chars, shown in the UI
  key_hash text not null unique,            -- sha256; the key is shown once
  created_by uuid references users(id) on delete set null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on api_keys (org_id);

create table integrations (                 -- could-have: Jira, Linear, Slack, Notion
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  kind text not null check (kind in ('jira','linear','slack','notion','datadog')),
  status text not null default 'connected' check (status in ('connected','error','disconnected')),
  credentials_encrypted bytea not null,
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, kind)
);

create table webhook_deliveries (           -- idempotency for GitHub + Stripe
  source text not null check (source in ('github','stripe')),
  delivery_id text not null,                -- X-GitHub-Delivery / Stripe event id
  event text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  primary key (source, delivery_id)
);
create index on webhook_deliveries (received_at);

-- ───────────────────────── triggers & RLS backstop ─────────────────────────

do $$
declare t text;
begin
  foreach t in array array['users','accounts','organizations','memberships','invites','installations',
    'repositories','knowledge_docs','review_configs','rules','pull_requests','reviews','findings',
    'api_keys','integrations']
  loop
    execute format('create trigger %I_updated_at before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
  foreach t in array array['users','accounts','sessions','verification_tokens','organizations','memberships',
    'invites','installations','repositories','code_chunks','knowledge_docs','review_configs','rules',
    'pull_requests','reviews','findings','feedback','usage_events','api_keys','integrations','webhook_deliveries']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
