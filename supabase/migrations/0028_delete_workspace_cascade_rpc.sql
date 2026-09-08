create or replace function public.delete_workspace_cascade(
  p_workspace_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.documents where workspace_id = p_workspace_id;
  delete from public.workspaces where id = p_workspace_id;
end;
$$;

alter function public.delete_workspace_cascade(uuid) owner to postgres;

revoke all on function public.delete_workspace_cascade(uuid) from public;
grant execute on function public.delete_workspace_cascade(uuid) to service_role;
