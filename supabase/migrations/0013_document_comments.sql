-- Document comments: link-scoped comments for public document viewer

alter table public.links
  add column if not exists comments_enabled boolean not null default false,
  add column if not exists comments_identity_mode text not null default 'anonymous';

alter table public.links
  drop constraint if exists links_comments_identity_mode_check;

alter table public.links
  add constraint links_comments_identity_mode_check
  check (comments_identity_mode in ('anonymous', 'verified_email'));

comment on column public.links.comments_enabled is 'Enable comments in public document viewer for this link.';
comment on column public.links.comments_identity_mode is 'Comment identity mode: anonymous or verified_email.';

create table if not exists public.comment_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  link_id uuid not null references public.links(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  page_number int not null check (page_number >= 1),
  anchor jsonb not null,
  state text not null default 'open' check (state in ('open', 'resolved')),
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comment_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  link_id uuid not null references public.links(id) on delete cascade,
  thread_id uuid not null references public.comment_threads(id) on delete cascade,
  body text not null,
  author_type text not null check (author_type in ('anonymous', 'verified_email')),
  author_key text not null,
  author_label text not null,
  author_color text not null,
  created_at timestamptz not null default now(),
  constraint comment_messages_body_not_empty check (char_length(trim(body)) > 0),
  constraint comment_messages_body_max_length check (char_length(body) <= 2000)
);

create index if not exists idx_comment_threads_link_doc_page
  on public.comment_threads(link_id, document_id, page_number);

create index if not exists idx_comment_threads_link_doc_updated_desc
  on public.comment_threads(link_id, document_id, updated_at desc);

create index if not exists idx_comment_messages_thread_created
  on public.comment_messages(thread_id, created_at);

create index if not exists idx_comment_messages_link_author_created
  on public.comment_messages(link_id, author_key, created_at desc);

drop trigger if exists comment_threads_set_timestamp on public.comment_threads;
create trigger comment_threads_set_timestamp
before update on public.comment_threads
for each row execute function public.tg_set_timestamp();

alter table public.comment_threads enable row level security;
alter table public.comment_messages enable row level security;

grant all on table public.comment_threads to postgres, service_role;
grant all on table public.comment_messages to postgres, service_role;
grant select on table public.comment_threads to authenticated;
grant select on table public.comment_messages to authenticated;

drop policy if exists comment_threads_select_members on public.comment_threads;
create policy comment_threads_select_members
on public.comment_threads
for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists comment_messages_select_members on public.comment_messages;
create policy comment_messages_select_members
on public.comment_messages
for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop function if exists public.resolve_public_link(uuid, uuid, text, text, boolean);

create or replace function public.resolve_public_link(
  document_id uuid,
  link_id uuid,
  email text,
  password text,
  accept_nda boolean
)
returns table(
  can_download boolean,
  apply_watermark boolean,
  dynamic_watermark_variables boolean,
  dynamic_watermark_email boolean,
  dynamic_watermark_ip boolean,
  watermark_id uuid,
  email_verification boolean,
  screenshot_protection boolean,
  expires_at timestamptz,
  show_qas boolean,
  curated_qas jsonb,
  show_feedback boolean,
  email_notify boolean,
  comments_enabled boolean,
  comments_identity_mode text,
  doc_id uuid,
  title text,
  file_type text,
  num_pages integer,
  storage_path text,
  converted_storage_path text,
  workspace_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  l links%rowtype;
  d documents%rowtype;
  ws_name text;
begin
  select * into l from public.links where id = link_id;
  if not found or l.document_id is distinct from document_id then
    raise exception 'NOT_FOUND';
  end if;

  if l.revoked_at is not null then
    raise exception 'REVOKED';
  end if;
  if l.expires_at is not null and l.expires_at < now() then
    raise exception 'EXPIRED';
  end if;

  if l.password_hash is not null then
    if password is null or crypt(password, l.password_hash) <> l.password_hash then
      raise exception 'BAD_PASSWORD';
    end if;
  end if;

  select * into d from public.documents where id = document_id;
  select name into ws_name from public.workspaces where id = d.workspace_id;

  can_download := l.can_download;
  apply_watermark := l.apply_watermark;
  dynamic_watermark_email := coalesce(l.dynamic_watermark_email, false);
  dynamic_watermark_ip := coalesce(l.dynamic_watermark_ip, false);
  dynamic_watermark_variables := dynamic_watermark_email or dynamic_watermark_ip;
  watermark_id := l.watermark_id;
  email_verification := l.email_verification;
  screenshot_protection := l.screenshot_protection;
  expires_at := l.expires_at;
  show_qas := l.show_qas;
  curated_qas := l.curated_qas;
  show_feedback := l.show_feedback;
  email_notify := l.email_notify;
  comments_enabled := coalesce(l.comments_enabled, false);
  comments_identity_mode := coalesce(l.comments_identity_mode, 'anonymous');
  doc_id := l.document_id;
  title := d.title;
  file_type := d.file_type;
  num_pages := d.num_pages;
  storage_path := d.storage_path;
  converted_storage_path := d.converted_storage_path;
  workspace_name := ws_name;
  return next;
end;
$$;

comment on function public.resolve_public_link(uuid, uuid, text, text, boolean)
is 'Resolves a public document link and exposes watermark selection + dynamic flags; email/NDA gates enforced by API layer.';
