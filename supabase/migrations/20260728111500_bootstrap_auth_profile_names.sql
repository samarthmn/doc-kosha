create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text;
begin
  v_full_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(new.email), '')
  );

  insert into public.profiles (id, full_name)
  values (new.id, v_full_name)
  on conflict (id) do update
  set full_name = excluded.full_name
  where nullif(btrim(public.profiles.full_name), '') is null
    and excluded.full_name is not null;

  return new;
end;
$$;

alter function public.handle_new_auth_user() owner to postgres;

insert into public.profiles (id, full_name)
select
  auth_user.id,
  coalesce(
    nullif(btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(auth_user.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(auth_user.email), '')
  )
from auth.users as auth_user
on conflict (id) do update
set full_name = excluded.full_name
where nullif(btrim(public.profiles.full_name), '') is null
  and excluded.full_name is not null;
