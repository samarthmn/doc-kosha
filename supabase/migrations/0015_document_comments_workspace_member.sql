-- Allow workspace members to author internal replies in comment_messages

alter table public.comment_messages
  drop constraint if exists comment_messages_author_type_check;

alter table public.comment_messages
  add constraint comment_messages_author_type_check
  check (author_type in ('anonymous', 'verified_email', 'workspace_member'));
