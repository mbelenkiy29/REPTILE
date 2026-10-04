-- Review comments the team writes themselves (not replies to REPTILE) are kept as a learning signal for suggested rules.
-- They belong to a pull request and a file, not to one of REPTILE's findings.
alter table feedback alter column finding_id drop not null;
alter table feedback add column pull_request_id uuid references pull_requests(id) on delete cascade;
alter table feedback add column file_path text;
alter table feedback add constraint feedback_target
  check (finding_id is not null or (kind = 'human_comment' and pull_request_id is not null));
-- GitHub can deliver the same comment more than once.
create unique index feedback_one_comment on feedback (org_id, provider_id) where kind = 'human_comment';
