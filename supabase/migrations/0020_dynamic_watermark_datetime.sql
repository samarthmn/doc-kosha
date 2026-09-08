-- Add "date & time" as a dynamic watermark option on links.

ALTER TABLE public.links
ADD COLUMN IF NOT EXISTS dynamic_watermark_datetime boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.links.dynamic_watermark_datetime IS 'Include access date/time beneath watermark';

-- Update resolve_public_link to expose the new flag and to keep dynamic_watermark_variables accurate.
DROP FUNCTION IF EXISTS public.resolve_public_link(uuid, uuid, text, text, boolean);

create or replace function public.resolve_public_link(
  document_id uuid,
  link_id uuid,
  email text,
  password text,
  accept_nda boolean
) returns table(
  can_download boolean,
  apply_watermark boolean,
  dynamic_watermark_variables boolean,
  dynamic_watermark_email boolean,
  dynamic_watermark_ip boolean,
  dynamic_watermark_datetime boolean,
  watermark_id uuid,
  email_verification boolean,
  screenshot_protection boolean,
  expires_at timestamp with time zone,
  show_qas boolean,
  curated_qas jsonb,
  show_feedback boolean,
  email_notify boolean,
  comments_enabled boolean,
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
set search_path to 'public'
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
  if d is null then
    raise exception 'DOCUMENT_NOT_FOUND';
  end if;
  select name into ws_name from public.workspaces where id = d.workspace_id;

  can_download := l.can_download;
  apply_watermark := l.apply_watermark;
  dynamic_watermark_email := coalesce(l.dynamic_watermark_email, false);
  dynamic_watermark_ip := coalesce(l.dynamic_watermark_ip, false);
  dynamic_watermark_datetime := coalesce(l.dynamic_watermark_datetime, false);
  dynamic_watermark_variables :=
    dynamic_watermark_email or dynamic_watermark_ip or dynamic_watermark_datetime;
  watermark_id := l.watermark_id;
  email_verification := l.email_verification;
  screenshot_protection := l.screenshot_protection;
  expires_at := l.expires_at;
  show_qas := l.show_qas;
  curated_qas := l.curated_qas;
  show_feedback := l.show_feedback;
  email_notify := l.email_notify;
  comments_enabled := coalesce(l.comments_enabled, false);
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

