-- Expand public link languages to include Spanish and German.

alter table public.workspace_public_settings
  drop constraint if exists workspace_public_settings_default_public_language_check;

alter table public.workspace_public_settings
  add constraint workspace_public_settings_default_public_language_check
  check (default_public_language in ('en', 'fr', 'es', 'de'));

alter table public.links
  drop constraint if exists links_public_language_override_check;

alter table public.links
  add constraint links_public_language_override_check
  check (
    public_language_override is null
    or public_language_override in ('en', 'fr', 'es', 'de')
  );
