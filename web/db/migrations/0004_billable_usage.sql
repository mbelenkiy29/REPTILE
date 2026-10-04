-- Usage recorded while an org isn't on the paid plan (trial, free) is never billed, and doesn't use up the
-- paid plan's included reviews after an upgrade. Existing rows keep billing as before.
alter table usage_events add column billable boolean not null default true;
