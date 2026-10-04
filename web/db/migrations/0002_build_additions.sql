-- Additions found while building the screens (/replica-build) and wiring Auth.js and the worker.

-- Auth.js adapter fields.
alter table accounts add column if not exists id_token text;
alter table accounts add column if not exists session_state text;

-- Review detail shows the files reviewed and, when nothing was found, what was checked.
alter table reviews add column if not exists files_reviewed jsonb not null default '[]';
alter table reviews add column if not exists checked text[] not null default '{}';

-- Integration cards show a status line ("Workspace: acme", "The bot was removed from #eng").
alter table integrations add column if not exists detail text;

-- Fixed-window rate limits (sign-in emails, invites, API). key = "<action>:<subject>".
create table if not exists rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0 check (count >= 0),
  primary key (key, window_start)
);
create index if not exists rate_limits_window on rate_limits (window_start);

-- Dead-letter log: jobs that failed all retries, visible to operators.
create table if not exists job_failures (
  id uuid primary key default gen_random_uuid(),
  queue text not null,
  job_id text not null,
  data jsonb not null default '{}',
  error text not null,
  created_at timestamptz not null default now(),
  unique (queue, job_id)
);
create index if not exists job_failures_created on job_failures (created_at desc);

alter table rate_limits enable row level security;
alter table job_failures enable row level security;
