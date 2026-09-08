begin;

select plan(9);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'email-user@example.com',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'google-user@example.com',
    '',
    now(),
    '{"provider":"google","providers":["google"]}'::jsonb,
    '{"full_name":"  Google User  ","name":"Ignored Name"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

select is(
  (
    select full_name
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000001'
  ),
  'email-user@example.com',
  'email auth users receive their email as the fallback profile name'
);

select is(
  (
    select full_name
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000002'
  ),
  'Google User',
  'Google auth users receive their trimmed provider display name'
);

update public.profiles
set full_name = 'Chosen Name'
where id = '10000000-0000-0000-0000-000000000001';

select is(
  (
    select full_name
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000001'
  ),
  'Chosen Name',
  'onboarding can overwrite the auth-time fallback name'
);

select isnt(
  has_function_privilege(
    'anon',
    'public.handle_new_auth_user()',
    'EXECUTE'
  ),
  true,
  'anonymous clients cannot execute the auth profile trigger function'
);

select isnt(
  has_function_privilege(
    'authenticated',
    'public.handle_new_auth_user()',
    'EXECUTE'
  ),
  true,
  'authenticated clients cannot execute the auth profile trigger function'
);

select ok(
  has_function_privilege(
    'supabase_auth_admin',
    'public.handle_new_auth_user()',
    'EXECUTE'
  ),
  'the Supabase Auth service retains trigger-function execution privilege'
);

select isnt(
  has_function_privilege(
    'anon',
    'public.create_notification_settings_for_new_user()',
    'EXECUTE'
  ),
  true,
  'anonymous clients cannot execute the notification-settings trigger function'
);

select isnt(
  has_function_privilege(
    'authenticated',
    'public.create_notification_settings_for_new_user()',
    'EXECUTE'
  ),
  true,
  'authenticated clients cannot execute the notification-settings trigger function'
);

select ok(
  has_function_privilege(
    'supabase_auth_admin',
    'public.create_notification_settings_for_new_user()',
    'EXECUTE'
  ),
  'the Supabase Auth service retains notification-settings trigger-function execution privilege'
);

select * from finish();

rollback;
