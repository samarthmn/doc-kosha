-- Add invite rejection tracking so owners can see when an invitee chose not to join.

alter table public.workspace_invites
  add column if not exists rejected_by uuid;

alter table public.workspace_invites
  add column if not exists rejected_at timestamptz;

alter table public.workspace_invites
  drop constraint if exists workspace_invites_rejected_by_fkey;

alter table public.workspace_invites
  add constraint workspace_invites_rejected_by_fkey
  foreign key (rejected_by)
  references auth.users(id)
  on delete set null;

drop index if exists public.idx_workspace_invites_unique_active;

create unique index if not exists idx_workspace_invites_unique_active
  on public.workspace_invites (workspace_id, lower(email))
  where accepted_at is null
    and revoked_at is null
    and rejected_at is null;

