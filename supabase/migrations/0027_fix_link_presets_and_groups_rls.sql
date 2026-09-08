-- After removing workspace base roles, `has_workspace_role(ws, ['owner','editor'])`
-- effectively became owner-only. These RLS policies were still using that helper,
-- blocking document editors from managing link presets + user groups via direct DML.
--
-- Align write policies with the same permission gate used by link management:
-- `public.can_edit_workspace_documents(workspace_id)`.

set search_path = public, auth;

-- Workspace user groups (used in link allowlists + presets)
drop policy if exists workspace_user_groups_write_editors on public.workspace_user_groups;
create policy workspace_user_groups_write_editors
on public.workspace_user_groups
using (public.can_edit_workspace_documents(workspace_id))
with check (public.can_edit_workspace_documents(workspace_id));

drop policy if exists workspace_user_group_emails_write_editors on public.workspace_user_group_emails;
create policy workspace_user_group_emails_write_editors
on public.workspace_user_group_emails
using (public.can_edit_workspace_documents(workspace_id))
with check (public.can_edit_workspace_documents(workspace_id));

-- Link presets (workspace-scoped)
drop policy if exists link_presets_write_editors on public.link_presets;
create policy link_presets_write_editors
on public.link_presets
using (public.can_edit_workspace_documents(workspace_id))
with check (public.can_edit_workspace_documents(workspace_id));

drop policy if exists link_preset_allowed_emails_write_editors on public.link_preset_allowed_emails;
create policy link_preset_allowed_emails_write_editors
on public.link_preset_allowed_emails
using (public.can_edit_workspace_documents(workspace_id))
with check (public.can_edit_workspace_documents(workspace_id));

drop policy if exists link_preset_blocked_emails_write_editors on public.link_preset_blocked_emails;
create policy link_preset_blocked_emails_write_editors
on public.link_preset_blocked_emails
using (public.can_edit_workspace_documents(workspace_id))
with check (public.can_edit_workspace_documents(workspace_id));

drop policy if exists link_preset_allowed_groups_write_editors on public.link_preset_allowed_groups;
create policy link_preset_allowed_groups_write_editors
on public.link_preset_allowed_groups
using (public.can_edit_workspace_documents(workspace_id))
with check (public.can_edit_workspace_documents(workspace_id));

drop policy if exists link_preset_blocked_groups_write_editors on public.link_preset_blocked_groups;
create policy link_preset_blocked_groups_write_editors
on public.link_preset_blocked_groups
using (public.can_edit_workspace_documents(workspace_id))
with check (public.can_edit_workspace_documents(workspace_id));

