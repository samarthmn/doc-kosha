-- 0039: conversion engine telemetry (office-engine rollout; plan: hyper-agent/office-engine)
-- Renumbered from the plan's 0038 — 0038 is already taken by
-- 0038_data_room_delete_and_create_permissions.sql.
alter table public.documents
  add column if not exists conversion_engine text,
  add column if not exists conversion_fallback_reason text,
  add column if not exists conversion_duration_ms integer;

comment on column public.documents.conversion_engine is
  'Engine that produced converted_storage_path: office-core-wasm | pdf-core-wasm | docyantra-libreoffice | docyantra-chromium';
comment on column public.documents.conversion_fallback_reason is
  'Set when an in-process engine attempt fell back to the DocYantra service (profile reason codes or error)';
comment on column public.documents.conversion_duration_ms is
  'Wall-clock conversion duration in ms (engine or service path)';
