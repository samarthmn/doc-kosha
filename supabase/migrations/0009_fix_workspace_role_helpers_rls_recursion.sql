-- Fix RLS recursion caused by helper functions querying RLS-protected tables.
-- After removing explicit workspace roles, we updated `has_workspace_role` and
-- `is_workspace_member` to consult `workspaces.created_by`. Because `workspaces`
-- policies themselves rely on these helpers, calling them as invoker (non
-- SECURITY DEFINER) can recurse and hit "stack depth limit exceeded".
--
-- Running these helpers as SECURITY DEFINER (owner: postgres) bypasses RLS and
-- breaks the recursion safely.

set search_path = public, auth;

create or replace function public.has_workspace_role(ws uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    (auth.role() = 'service_role')
    or (
      auth.uid() is not null
      and ('owner' = any(roles))
      and exists (
        select 1
        from public.workspaces w
        where w.id = ws
          and w.created_by = auth.uid()
      )
    );
$$;

create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    (auth.role() = 'service_role')
    or (
      auth.uid() is not null
      and (
        exists (
          select 1
          from public.workspaces w
          where w.id = ws
            and w.created_by = auth.uid()
        )
        or exists (
          select 1
          from public.workspace_members wm
          where wm.workspace_id = ws
            and wm.user_id = auth.uid()
        )
      )
    );
$$;
