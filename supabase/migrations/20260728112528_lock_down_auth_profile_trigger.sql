revoke all on function public.handle_new_auth_user()
  from public, anon, authenticated;
grant execute on function public.handle_new_auth_user()
  to supabase_auth_admin;

alter function public.requeue_skipped_founder_help_job(text)
  set search_path = '';
