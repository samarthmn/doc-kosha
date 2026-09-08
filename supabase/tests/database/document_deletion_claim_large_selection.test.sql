begin;

select plan(1);

select lives_ok(
  $$
    insert into public.document_deletion_claims (
      workspace_id,
      data_room_id,
      initiated_by,
      explicit_document_ids,
      explicit_folder_ids
    )
    select
      gen_random_uuid(),
      null,
      gen_random_uuid(),
      array_agg(gen_random_uuid() order by item),
      '{}'::uuid[]
    from generate_series(1, 300) as selected(item)
  $$,
  'a deletion claim can store 300 explicit ids without exceeding a btree row'
);

select * from finish();

rollback;
