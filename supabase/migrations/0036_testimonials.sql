create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  role_title text not null check (char_length(trim(role_title)) between 1 and 120),
  company text not null check (char_length(trim(company)) between 1 and 160),
  testimonial text not null check (char_length(trim(testimonial)) between 20 and 3000),
  headshot_storage_path text null,
  consent_public_featured boolean not null default true,
  created_at timestamptz not null default now(),
  constraint testimonials_workspace_user_key unique (workspace_id, user_id)
);

create index if not exists idx_testimonials_workspace_created_at
  on public.testimonials(workspace_id, created_at desc);

alter table public.testimonials enable row level security;

grant all on table public.testimonials to postgres, service_role;
grant select, insert on table public.testimonials to authenticated;

drop policy if exists testimonials_select_self on public.testimonials;
create policy testimonials_select_self
on public.testimonials
for select
to authenticated
using (
  user_id = auth.uid()
  and public.is_workspace_member(workspace_id)
);

drop policy if exists testimonials_insert_self on public.testimonials;
create policy testimonials_insert_self
on public.testimonials
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_workspace_member(workspace_id)
);
