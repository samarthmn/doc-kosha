-- Drop preset linkage from members/invites.
-- Presets are apply-only UI convenience and must not be persisted on rows.

alter table public.workspace_members
  drop column if exists role_preset_id;

alter table public.workspace_invites
  drop column if exists role_preset_id;
