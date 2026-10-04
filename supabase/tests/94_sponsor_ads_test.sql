-- =====================================================================
-- FuelOS — sponsor ads, DB side 1 (migration 20261004000200_sponsor_ads.sql)
--   psql -X -q -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/94_sponsor_ads_test.sql
-- Runs after migrations + seed.sql, in one transaction that is rolled back.
-- =====================================================================
\set QUIET on
\pset tuples_only on
\o /dev/null
begin;
create function pg_temp.act_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', case when p_user is null then '' else json_build_object('sub', p_user, 'role', 'authenticated')::text end, true); $$;
create function pg_temp.ok(p_cond boolean, p_label text) returns void language plpgsql as $$
begin if p_cond is distinct from true then raise exception 'FAIL: %', p_label; end if; raise notice 'PASS  %', p_label; end $$;
create function pg_temp.throws(p_sql text, p_expected text, p_label text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm = p_expected or sqlstate = p_expected then raise notice 'PASS  % (%)', p_label, p_expected; return; end if;
    raise exception 'FAIL: % — expected %, got % / %', p_label, p_expected, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL: % — expected %, but no error', p_label, p_expected;
end $$;
-- like throws(), but also checks the error DETAIL (FUELOS_BAD_REQUEST carries link / dates / image_path)
create function pg_temp.throws_detail(p_sql text, p_expected text, p_detail text, p_label text) returns void language plpgsql as $$
declare v_detail text;
begin
  begin execute p_sql;
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    if (sqlerrm = p_expected or sqlstate = p_expected) and v_detail is not distinct from p_detail then
      raise notice 'PASS  % (% / %)', p_label, p_expected, p_detail; return; end if;
    raise exception 'FAIL: % — expected % / %, got % / % / %', p_label, p_expected, p_detail, sqlstate, sqlerrm, v_detail;
  end;
  raise exception 'FAIL: % — expected %, but no error', p_label, p_expected;
end $$;

select '11111111-0000-4000-8000-000000000001' as owner, '11111111-0000-4000-8000-000000000004' as attendant,
       '11111111-0000-4000-8000-000000000007' as admin, '11111111-0000-4000-8000-0000000000a1' as support \gset
select 'ads/' || gen_random_uuid() || '.png' as img1, 'ads/' || gen_random_uuid() || '.gif' as img2,
       'ads/' || gen_random_uuid() || '.webp' as img3, 'ads/' || gen_random_uuid() || '.jpg' as img4 \gset
insert into auth.users (id, email, created_at, updated_at) values (:'support', 'ads-support@demo.fuelos.app', now(), now());
insert into platform_staff (user_id, role) values (:'support', 'support');

-- 1. schema: tables, RLS, bucket
select pg_temp.ok((select relrowsecurity from pg_class where oid = 'public.ads'::regclass), 'ads has RLS enabled');
select pg_temp.ok((select relrowsecurity from pg_class where oid = 'public.ad_events'::regclass), 'ad_events has RLS enabled');
select pg_temp.ok((select count(*) = 0 from pg_policies where tablename in ('ads', 'ad_events')), 'no RLS policies: no direct API access');
select pg_temp.ok((select public and file_size_limit = 3 * 1024 * 1024 and file_size_limit = 3145728
                          and allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
                          and array_length(allowed_mime_types, 1) = 4
                     from storage.buckets where id = 'ad-images'),
                  'bucket ad-images: public, 3 MB, the four image MIME types');

-- 2. who may call save_ad / archive_ad / admin_ads
set local role authenticated;
select pg_temp.act_as(:'owner');
select pg_temp.throws(format('select save_ad(null, %L, %L, %L, null, null, null, null, null)', 'راعي', 'عنوان', :'img1'), '42501', 'a station owner cannot save an ad');
select pg_temp.throws('select archive_ad(gen_random_uuid())', '42501', 'a station owner cannot archive an ad');
select pg_temp.throws('select admin_ads()', '42501', 'a station owner cannot list ads');
select pg_temp.act_as(:'attendant');
select pg_temp.throws(format('select save_ad(null, %L, %L, %L, null, null, null, null, null)', 'راعي', 'عنوان', :'img1'), '42501', 'an attendant cannot save an ad');
select pg_temp.throws('select admin_ads()', '42501', 'an attendant cannot list ads');
select pg_temp.act_as(:'support');
select pg_temp.throws(format('select save_ad(null, %L, %L, %L, null, null, null, null, null)', 'راعي', 'عنوان', :'img1'), '42501', 'platform support cannot save an ad');
select pg_temp.throws('select archive_ad(gen_random_uuid())', '42501', 'platform support cannot archive an ad');
select pg_temp.ok(jsonb_typeof(admin_ads()) = 'array', 'platform support can list ads (read-only)');
select pg_temp.act_as(null);
select pg_temp.throws(format('select save_ad(null, %L, %L, %L, null, null, null, null, null)', 'راعي', 'عنوان', :'img1'), '42501', 'an anonymous caller (no JWT) cannot save an ad');
select pg_temp.throws('select admin_ads()', '42501', 'an anonymous caller cannot list ads');
reset role;
set local role anon;
select pg_temp.throws(format('select save_ad(null, %L, %L, %L, null, null, null, null, null)', 'راعي', 'عنوان', :'img1'), '42501', 'the anon role has no execute grant on save_ad');
select pg_temp.throws('select archive_ad(gen_random_uuid())', '42501', 'the anon role has no execute grant on archive_ad');
select pg_temp.throws('select admin_ads()', '42501', 'the anon role has no execute grant on admin_ads');
reset role;
select pg_temp.ok(has_function_privilege('anon', 'public.save_ad(uuid,text,text,text,text,timestamptz,timestamptz,integer,boolean)', 'execute') = false, 'anon has no execute privilege on save_ad');
select pg_temp.ok(has_function_privilege('anon', 'public.archive_ad(uuid)', 'execute') = false, 'anon has no execute privilege on archive_ad');
select pg_temp.ok(has_function_privilege('anon', 'public.admin_ads()', 'execute') = false, 'anon has no execute privilege on admin_ads');
select pg_temp.ok(has_function_privilege('anon', 'public.active_ads()', 'execute') = true, 'anon may execute active_ads');
select pg_temp.ok(has_function_privilege('anon', 'public.record_ad_event(uuid,text,text)', 'execute') = true, 'anon may execute record_ad_event');
select pg_temp.ok(has_function_privilege('anon', 'public.ad_events_budget_bytes()', 'execute') = false and has_function_privilege('authenticated', 'public.ad_events_budget_bytes()', 'execute') = false, 'the budget helper is not callable by API roles');
select pg_temp.ok((select provolatile = 's' from pg_proc where oid = 'public.active_ads()'::regprocedure), 'active_ads is stable');

-- 3. save_ad: insert, trimming, audit
set local role authenticated;
select pg_temp.act_as(:'admin');
select save_ad(null, '  شركة الزيوت  ', '  زيت محرك  ', :'img1', 'https://example.com/x', null, null, null, null)::text as r1 \gset
reset role;
create temp table _r1 as select :'r1'::jsonb as j;
select pg_temp.ok((select j->>'sponsor_name' = 'شركة الزيوت' and j->>'title' = 'زيت محرك' from _r1), 'save_ad trims sponsor and title');
select pg_temp.ok((select j->>'image_path' = :'img1' and j->>'link_url' = 'https://example.com/x' from _r1), 'save_ad returns the saved row (image + link)');
select pg_temp.ok((select (j->>'sort_order')::int = 0 and (j->>'is_paused')::boolean = false and j->>'archived_at' is null
                          and j->>'created_by' = :'admin' and (j->>'starts_at')::timestamptz <= now() and j->>'ends_at' is null from _r1),
                  'defaults: sort 0, not paused, starts now, open-ended, created_by = the admin');
select j->>'id' as ad1 from _r1 \gset
select pg_temp.ok((select count(*) = 1 from ads where id = :'ad1'), 'the ad row exists');
select pg_temp.ok((select count(*) = 1 from audit_log where entity = 'ads' and entity_id = :'ad1' and action = 'insert' and actor_id = :'admin'
                          and station_id is null and after->>'sponsor_name' = 'شركة الزيوت'),
                  'the insert is written to audit_log (entity ads)');

-- 4. validation
set local role authenticated;
select pg_temp.act_as(:'admin');
select pg_temp.throws(format('select save_ad(null, %L, %L, %L, null, null, null, null, null)', '   ', 'عنوان', :'img1'), 'FUELOS_REQUIRED', 'blank sponsor is required');
select pg_temp.throws(format('select save_ad(null, null, %L, %L, null, null, null, null, null)', 'عنوان', :'img1'), 'FUELOS_REQUIRED', 'null sponsor is required');
select pg_temp.throws(format('select save_ad(null, %L, %L, %L, null, null, null, null, null)', 'راعي', '', :'img1'), 'FUELOS_REQUIRED', 'blank title is required');
select pg_temp.throws(format('select save_ad(null, %L, %L, null, null, null, null, null, null)', 'راعي', 'عنوان'), 'FUELOS_REQUIRED', 'a missing image is required');
select pg_temp.throws(format('select save_ad(null, %L, %L, %L, null, null, null, null, null)', repeat('x', 121), 'عنوان', :'img1'), 'FUELOS_BAD_REQUEST', 'sponsor over 120 chars is rejected');
select pg_temp.throws(format('select save_ad(null, %L, %L, %L, null, null, null, null, null)', 'راعي', repeat('x', 121), :'img1'), 'FUELOS_BAD_REQUEST', 'title over 120 chars is rejected');
select pg_temp.ok(save_ad(null, repeat('x', 120), repeat('y', 120), :'img2', null, null, null, null, null) is not null, 'exactly 120 chars is accepted');
select pg_temp.throws_detail(format('select save_ad(null, %L, %L, %L, %L, null, null, null, null)', 'راعي', 'عنوان', :'img1', 'http://x.com'), 'FUELOS_BAD_REQUEST', 'link', 'http link is rejected');
select pg_temp.throws_detail(format('select save_ad(null, %L, %L, %L, %L, null, null, null, null)', 'راعي', 'عنوان', :'img1', 'javascript:alert(1)'), 'FUELOS_BAD_REQUEST', 'link', 'javascript: link is rejected');
select pg_temp.throws_detail(format('select save_ad(null, %L, %L, %L, %L, null, null, null, null)', 'راعي', 'عنوان', :'img1', 'https://a b.com'), 'FUELOS_BAD_REQUEST', 'link', 'a link with a space is rejected');
select pg_temp.throws_detail(format('select save_ad(null, %L, %L, %L, %L, null, null, null, null)', 'راعي', 'عنوان', :'img1', 'tel:12'), 'FUELOS_BAD_REQUEST', 'link', 'a too-short tel: link is rejected');
select pg_temp.ok(save_ad(null, 'راعي', 'واتساب', :'img3', 'https://wa.me/963944123456', null, null, null, null)->>'link_url' = 'https://wa.me/963944123456', 'a wa.me https link is accepted');
select pg_temp.ok(save_ad(null, 'راعي', 'اتصال', :'img4', 'tel:+963944123456', null, null, null, null)->>'link_url' = 'tel:+963944123456', 'a tel:+digits link is accepted');
select pg_temp.ok(save_ad(null, 'راعي', 'بلا رابط', :'img1', '   ', null, null, null, null)->>'link_url' is null, 'an empty link string is stored as null');
select pg_temp.throws_detail(format('select save_ad(null, %L, %L, %L, null, null, null, null, null)', 'راعي', 'عنوان', '../evil.gif'), 'FUELOS_BAD_REQUEST', 'image_path', 'a path-traversal image_path is rejected');
select pg_temp.throws_detail(format('select save_ad(null, %L, %L, %L, null, null, null, null, null)', 'راعي', 'عنوان', 'ads/not-a-uuid.png'), 'FUELOS_BAD_REQUEST', 'image_path', 'a non-uuid image name is rejected');
select pg_temp.throws_detail(format('select save_ad(null, %L, %L, %L, null, null, null, null, null)', 'راعي', 'عنوان', 'ads/' || gen_random_uuid() || '.svg'), 'FUELOS_BAD_REQUEST', 'image_path', 'an svg image is rejected');
select pg_temp.throws_detail(format('select save_ad(null, %L, %L, %L, null, now(), now(), null, null)', 'راعي', 'عنوان', :'img1'), 'FUELOS_BAD_REQUEST', 'dates', 'ends_at = starts_at is rejected');
select pg_temp.throws_detail(format('select save_ad(null, %L, %L, %L, null, now(), now() - interval ''1 day'', null, null)', 'راعي', 'عنوان', :'img1'), 'FUELOS_BAD_REQUEST', 'dates', 'ends_at before starts_at is rejected');
select pg_temp.throws_detail(format('select save_ad(null, %L, %L, %L, null, null, now() - interval ''1 day'', null, null)', 'راعي', 'عنوان', :'img1'), 'FUELOS_BAD_REQUEST', 'dates', 'ends_at before the default start (now) is rejected');
reset role;

-- 5. update
set local role authenticated;
select pg_temp.act_as(:'admin');
select save_ad(:'ad1'::uuid, 'شركة الزيوت 2', 'زيت جديد', :'img2', 'tel:+963944123456', now() - interval '1 day', now() + interval '10 days', 5, true)::text as r2 \gset
reset role;
create temp table _r2 as select :'r2'::jsonb as j;
select pg_temp.ok((select j->>'id' = :'ad1' and j->>'sponsor_name' = 'شركة الزيوت 2' and j->>'title' = 'زيت جديد' and j->>'image_path' = :'img2'
                          and j->>'link_url' = 'tel:+963944123456' and (j->>'sort_order')::int = 5 and (j->>'is_paused')::boolean from _r2),
                  'update with p_id changes the fields');
select pg_temp.ok((select (j->>'updated_at')::timestamptz > (j->>'created_at')::timestamptz from _r2), 'update moves updated_at past created_at');
select pg_temp.ok((select (j->>'created_by') = :'admin' and (j->>'created_at')::timestamptz = (select created_at from ads where id = :'ad1') from _r2), 'update keeps created_by / created_at');
select pg_temp.ok((select count(*) = 1 from ads where sponsor_name = 'شركة الزيوت 2'), 'update did not insert a second row');
select pg_temp.ok((select count(*) = 1 from audit_log where entity = 'ads' and entity_id = :'ad1' and action = 'update'
                          and before->>'sponsor_name' = 'شركة الزيوت' and after->>'sponsor_name' = 'شركة الزيوت 2'),
                  'the update is audited with before and after');
set local role authenticated;
select pg_temp.act_as(:'admin');
select pg_temp.throws(format('select save_ad(gen_random_uuid(), %L, %L, %L, null, null, null, null, null)', 'راعي', 'عنوان', :'img1'), 'FUELOS_NOT_FOUND', 'an unknown p_id is not found');
-- an update with null p_starts / p_sort / p_paused keeps the stored values; a null p_ends is open-ended
select save_ad(:'ad1'::uuid, 'ش', 'ع', :'img2', null, now() + interval '2 days', now() + interval '20 days', 5, true)->>'starts_at' as fut_start \gset
select save_ad(:'ad1'::uuid, 'ش2', 'ع2', :'img2', null, null, null, null, null)::text as r3 \gset
reset role;
create temp table _r3 as select :'r3'::jsonb as j;
select pg_temp.ok((select (j->>'starts_at')::timestamptz = (:'fut_start')::timestamptz and (j->>'sort_order')::int = 5 and (j->>'is_paused')::boolean
                          and j->>'ends_at' is null and j->>'sponsor_name' = 'ش2' from _r3),
                  'update with null starts / sort / paused keeps the future starts_at, sort 5, paused true; null ends = open-ended');
select pg_temp.ok((select starts_at > now() from ads where id = :'ad1'), 'the kept starts_at is still in the future');
set local role authenticated;
select pg_temp.act_as(:'admin');
select pg_temp.throws_detail(format('select save_ad(%L::uuid, %L, %L, %L, null, null, now() + interval ''1 day'', null, null)', :'ad1', 'ش', 'ع', :'img2'), 'FUELOS_BAD_REQUEST', 'dates', 'an update with null starts checks ends against the stored start');
select pg_temp.ok(save_ad(:'ad1'::uuid, 'ش', 'ع', :'img2', null, now() - interval '5 days', now() - interval '4 days', null, null)->>'sort_order' = '5', 'an update may end in the past');
select pg_temp.ok((select (r->>'ends_at')::timestamptz < now() from (select save_ad(:'ad1'::uuid, 'ش', 'ع', :'img2', null, null, now() - interval '3 days', null, null) r) x), 'null starts keeps the stored (past) start, so a past ends_at after it is accepted');
reset role;

-- 6. admin_ads: status, views/clicks, archive
-- clean slate for a deterministic list
delete from ads;
set local role authenticated;
select pg_temp.act_as(:'admin');
select save_ad(null, 'S-running', 'running', :'img1', null, null, null, 2, null)->>'id' as a_run \gset
select save_ad(null, 'S-sched', 'scheduled', :'img1', null, now() + interval '1 day', null, 1, null)->>'id' as a_sch \gset
select save_ad(null, 'S-paused', 'paused', :'img1', null, null, null, 3, true)->>'id' as a_pau \gset
select save_ad(null, 'S-ended', 'ended', :'img1', null, now() - interval '3 days', now() - interval '1 day', 4, null)->>'id' as a_end \gset
select save_ad(null, 'S-paused-future', 'paused+future', :'img1', null, now() + interval '1 day', null, 5, true)->>'id' as a_pf \gset
select save_ad(null, 'S-archived', 'archived', :'img1', null, null, null, 6, null)->>'id' as a_arc \gset
select archive_ad(:'a_arc'::uuid)::text as arc \gset
select admin_ads()::text as lst \gset
reset role;
create temp table _arc as select :'arc'::jsonb as j;
create temp table _lst as select :'lst'::jsonb as j;
select pg_temp.ok((select j->>'id' = :'a_arc' and j->>'archived_at' is not null from _arc), 'archive_ad returns {id, archived_at}');
select pg_temp.ok((select (select count(*) from jsonb_object_keys(j)) = 2 from _arc), 'archive_ad returns exactly id and archived_at');
select pg_temp.ok((select count(*) = 1 from audit_log where entity = 'ads' and entity_id = :'a_arc' and action = 'archive' and actor_id = :'admin' and station_id is null),
                  'archive is audited');
select pg_temp.ok((select jsonb_array_length(j) = 5 from _lst), 'admin_ads lists the 5 non-archived ads');
select pg_temp.ok((select count(*) = 0 from _lst, jsonb_array_elements(j) a where a->>'id' = :'a_arc'), 'an archived ad is absent from admin_ads');
select pg_temp.ok((select a->>'status' = 'scheduled' from _lst, jsonb_array_elements(j) a where a->>'id' = :'a_sch'), 'a future start is scheduled');
select pg_temp.ok((select a->>'status' = 'running' from _lst, jsonb_array_elements(j) a where a->>'id' = :'a_run'), 'an ad inside its window is running');
select pg_temp.ok((select a->>'status' = 'paused' from _lst, jsonb_array_elements(j) a where a->>'id' = :'a_pau'), 'a paused ad is paused');
select pg_temp.ok((select a->>'status' = 'ended' from _lst, jsonb_array_elements(j) a where a->>'id' = :'a_end'), 'a past ends_at is ended');
select pg_temp.ok((select a->>'status' = 'paused' from _lst, jsonb_array_elements(j) a where a->>'id' = :'a_pf'), 'paused wins over scheduled');
select pg_temp.ok((select bool_and((a->>'views')::int = 0 and (a->>'clicks')::int = 0) from _lst, jsonb_array_elements(j) a), 'views and clicks are 0 with no events');
select pg_temp.ok((select (jsonb_agg(a->>'sponsor_name' order by ord)) = '["S-sched", "S-running", "S-paused", "S-ended", "S-paused-future"]'::jsonb
                     from _lst, jsonb_array_elements(j) with ordinality t(a, ord)), 'admin_ads is ordered by sort_order');
-- views / clicks come from ad_events
select gen_random_uuid()::text as k1, gen_random_uuid()::text as k2, gen_random_uuid()::text as k9 \gset
insert into ad_events (ad_id, kind, day, viewer_key) values
  (:'a_run', 'view', current_date, :'k1'), (:'a_run', 'view', current_date, :'k2'), (:'a_run', 'view', current_date - 1, :'k1'),
  (:'a_run', 'click', current_date, :'k1');
set local role authenticated;
select pg_temp.act_as(:'support');
select pg_temp.ok((select (a->>'views')::int = 3 and (a->>'clicks')::int = 1 from jsonb_array_elements(admin_ads()) a where a->>'id' = :'a_run'),
                  'views and clicks are counted from ad_events (support can read)');
select pg_temp.act_as(:'admin');
select pg_temp.throws('select archive_ad(gen_random_uuid())', 'FUELOS_NOT_FOUND', 'archiving an unknown ad is not found');
select pg_temp.throws(format('select archive_ad(%L::uuid)', :'a_arc'), 'FUELOS_NOT_FOUND', 'archiving an already archived ad is not found');
select pg_temp.throws(format('select save_ad(%L::uuid, %L, %L, %L, null, null, null, null, null)', :'a_arc', 'راعي', 'عنوان', :'img1'), 'FUELOS_NOT_FOUND', 'an archived ad cannot be edited');
reset role;
-- the unique key: one event per (ad, kind, day, viewer)
select pg_temp.throws(format('insert into ad_events (ad_id, kind, day, viewer_key) values (%L, ''view'', current_date, %L)', :'a_run', :'k1'), '23505', 'ad_events is unique per ad / kind / day / viewer');
select pg_temp.throws(format('insert into ad_events (ad_id, kind, day, viewer_key) values (%L, ''share'', current_date, %L)', :'a_run', :'k9'), '23514', 'ad_events kind is view or click');
select pg_temp.throws(format('insert into ad_events (ad_id, kind, day, viewer_key) values (%L, ''view'', current_date, ''k9'')', :'a_run'), '23514', 'ad_events viewer_key must be a uuid string');
select pg_temp.throws(format('insert into ad_events (ad_id, kind, day, viewer_key) values (%L, ''view'', current_date, '''')', :'a_run'), '23514', 'ad_events viewer_key cannot be empty');
select pg_temp.throws(format('insert into ad_events (ad_id, kind, day, viewer_key) values (%L, ''view'', current_date, %L)', :'a_run', upper(:'k9')), '23514', 'ad_events viewer_key must be lower-case');
select pg_temp.ok((select count(*) = 1 from pg_indexes where tablename = 'ad_events' and indexdef like '%(day)%'), 'ad_events has an index on day (for ad_stats scans)');

-- 7. API roles have no direct table access
set local role authenticated;
select pg_temp.act_as(:'admin');
select pg_temp.throws('select count(*) from ads', '42501', 'even a platform admin cannot select ads directly');
select pg_temp.throws('select count(*) from ad_events', '42501', 'even a platform admin cannot select ad_events directly');
select pg_temp.throws(format('insert into ads (sponsor_name, title, image_path) values (''x'', ''y'', %L)', :'img1'), '42501', 'authenticated cannot insert into ads');
select pg_temp.throws(format('update ads set is_paused = true where id = %L', :'a_run'), '42501', 'authenticated cannot update ads');
select pg_temp.throws(format('insert into ad_events (ad_id, kind, day, viewer_key) values (%L, ''view'', current_date, %L)', :'a_run', :'k9'), '42501', 'authenticated cannot insert into ad_events directly');
reset role;
set local role anon;
select pg_temp.throws('select count(*) from ads', '42501', 'anon cannot select ads');
select pg_temp.throws('select count(*) from ad_events', '42501', 'anon cannot select ad_events');
select pg_temp.throws(format('insert into ad_events (ad_id, kind, day, viewer_key) values (%L, ''view'', current_date, %L)', :'a_run', :'k9'), '42501', 'anon cannot insert into ad_events directly');
reset role;

-- 8. storage policies: only a platform admin writes to ad-images
set local role authenticated;
select pg_temp.act_as(:'owner');
select pg_temp.throws(format('insert into storage.objects (bucket_id, name) values (''ad-images'', %L)', :'img1'), '42501', 'a station owner cannot upload an ad image');
select pg_temp.act_as(:'support');
select pg_temp.throws(format('insert into storage.objects (bucket_id, name) values (''ad-images'', %L)', :'img1'), '42501', 'platform support cannot upload an ad image');
select pg_temp.act_as(:'admin');
insert into storage.objects (bucket_id, name, owner) values ('ad-images', :'img1', :'admin');
select pg_temp.ok((select count(*) = 1 from storage.objects where bucket_id = 'ad-images' and name = :'img1'), 'a platform admin can upload an ad image');
update storage.objects set name = :'img3' where bucket_id = 'ad-images' and name = :'img1';
select pg_temp.ok((select count(*) = 1 from storage.objects where bucket_id = 'ad-images' and name = :'img3'), 'a platform admin can replace an ad image');
select pg_temp.throws(format('update storage.objects set name = %L where bucket_id = ''ad-images'' and name = %L', 'other/' || gen_random_uuid() || '.png', :'img3'), '42501', 'an admin cannot rename an ads/ object to a name outside ads/');
select pg_temp.ok((select count(*) = 1 from storage.objects where bucket_id = 'ad-images' and name = :'img3'), 'the object is still at its ads/ name after the blocked rename');
select pg_temp.act_as(:'owner');
update storage.objects set name = :'img4' where bucket_id = 'ad-images' and name = :'img3';
delete from storage.objects where bucket_id = 'ad-images' and name = :'img3';
select pg_temp.act_as(:'admin');
select pg_temp.ok((select count(*) = 1 from storage.objects where bucket_id = 'ad-images' and name = :'img3'), 'a station owner can neither update nor delete an ad image');
delete from storage.objects where bucket_id = 'ad-images' and name = :'img3';
select pg_temp.ok((select count(*) = 0 from storage.objects where bucket_id = 'ad-images' and name = :'img3'), 'a platform admin can delete an ad image');
select pg_temp.throws(format('insert into storage.objects (bucket_id, name) values (''meter-photos'', %L)', :'img1'), '42501', 'the admin policy does not open other buckets');
select pg_temp.throws(format('insert into storage.objects (bucket_id, name) values (''ad-images'', %L)', 'other/' || gen_random_uuid() || '.png'), '42501', 'an admin cannot write ad-images objects outside ads/');
select pg_temp.throws(format('insert into storage.objects (bucket_id, name) values (''ad-images'', %L)', 'x.png'), '42501', 'an admin cannot write ad-images objects at the bucket root');
reset role;
-- an object that already sits outside ads/ (planted by a privileged role) can be neither renamed into place, updated nor deleted by the admin
insert into storage.objects (bucket_id, name) values ('ad-images', 'stray/' || :'k9' || '.png');
set local role authenticated;
select pg_temp.act_as(:'admin');
update storage.objects set name = :'img4' where bucket_id = 'ad-images' and name = 'stray/' || :'k9' || '.png';
delete from storage.objects where bucket_id = 'ad-images' and name = 'stray/' || :'k9' || '.png';
select pg_temp.ok((select count(*) = 0 from storage.objects where bucket_id = 'ad-images' and name = 'stray/' || :'k9' || '.png'), 'admin cannot see (so not delete/update) ad-images objects outside ads/');
reset role;
select pg_temp.ok((select count(*) = 1 from storage.objects where bucket_id = 'ad-images' and name = 'stray/' || :'k9' || '.png'), 'the stray ad-images object is untouched');

-- 9. active_ads / record_ad_event / ad_stats
delete from ads;
select gen_random_uuid()::text as v1, gen_random_uuid()::text as v2, gen_random_uuid()::text as v3, upper(gen_random_uuid()::text) as vup \gset
set local role authenticated;
select pg_temp.act_as(:'admin');
select save_ad(null, 'P-run-b', 'run b', :'img1', 'https://example.com/b', null, null, 2, null)->>'id' as p_b \gset
select save_ad(null, 'P-run-a', 'run a', :'img2', 'https://example.com/a', null, null, 1, null)->>'id' as p_a \gset
select save_ad(null, 'P-run-a2', 'run a2', :'img3', null, null, null, 1, null)->>'id' as p_a2 \gset
select save_ad(null, 'P-paused', 'paused', :'img1', null, null, null, 0, true)->>'id' as p_pau \gset
select save_ad(null, 'P-sched', 'scheduled', :'img1', null, now() + interval '1 day', null, 0, null)->>'id' as p_sch \gset
select save_ad(null, 'P-ended', 'ended', :'img1', null, now() - interval '3 days', now() - interval '1 day', 0, null)->>'id' as p_end \gset
select save_ad(null, 'P-arch', 'archived', :'img1', null, null, null, 0, null)->>'id' as p_arc \gset
select archive_ad(:'p_arc'::uuid)::text as _arc \gset
reset role;
-- deterministic creation order inside the same sort_order: p_a2 is newer than p_a
update ads set created_at = now() - interval '2 hours' where id = :'p_a';
update ads set created_at = now() - interval '1 hour' where id = :'p_a2';
update ads set created_at = now() - interval '3 hours' where id = :'p_b';

-- 9a. active_ads
set local role anon;
select active_ads()::text as act \gset
reset role;
create temp table _act as select :'act'::jsonb as j;
select pg_temp.ok((select jsonb_typeof(j) = 'array' and jsonb_array_length(j) = 3 from _act), 'active_ads (anon) returns only the 3 running ads');
select pg_temp.ok((select jsonb_agg(a->>'sponsor_name' order by ord) = '["P-run-a2", "P-run-a", "P-run-b"]'::jsonb
                     from _act, jsonb_array_elements(j) with ordinality t(a, ord)), 'active_ads is ordered by sort_order, then newest first');
select pg_temp.ok((select bool_and(a ?& array['id', 'sponsor_name', 'title', 'image_path', 'link_url', 'sort_order'] and (select count(*) from jsonb_object_keys(a)) = 6)
                     from _act, jsonb_array_elements(j) a), 'active_ads rows have exactly id, sponsor_name, title, image_path, link_url, sort_order');
select pg_temp.ok((select count(*) = 0 from _act, jsonb_array_elements(j) a where a ? 'created_by'), 'active_ads exposes no created_by');
select pg_temp.ok((select a->>'link_url' = 'https://example.com/b' and a->>'image_path' = :'img1' and (a->>'sort_order')::int = 2 and a->>'id' = :'p_b' and a->>'sponsor_name' = 'P-run-b'
                     from _act, jsonb_array_elements(j) a where a->>'title' = 'run b'), 'active_ads returns the real field values');
select pg_temp.ok((select a->'link_url' = 'null'::jsonb from _act, jsonb_array_elements(j) a where a->>'title' = 'run a2'), 'a missing link is JSON null');
select pg_temp.ok((select count(*) = 0 from _act, jsonb_array_elements(j) a where a->>'id' in (:'p_pau', :'p_sch', :'p_end', :'p_arc')), 'paused / scheduled / ended / archived ads are not active');
set local role authenticated;
select pg_temp.act_as(:'owner');
select pg_temp.ok(jsonb_array_length(active_ads()) = 3, 'active_ads works for an authenticated user too');
reset role;

-- 9b. record_ad_event
set local role anon;
select record_ad_event(:'p_a'::uuid, 'view', :'v1')::text as e1 \gset
select record_ad_event(:'p_a'::uuid, 'view', :'v1')::text as e2 \gset
select record_ad_event(:'p_a'::uuid, 'click', :'v1')::text as e3 \gset
select record_ad_event(:'p_a'::uuid, 'click', :'v1')::text as e4 \gset
select record_ad_event(:'p_a'::uuid, 'view', :'v2')::text as e5 \gset
select record_ad_event(:'p_a'::uuid, 'view', :'vup')::text as e6 \gset
reset role;
select pg_temp.ok(:'e1'::jsonb = '{"recorded": true}'::jsonb, 'the first view of an active ad is recorded');
select pg_temp.ok(:'e2'::jsonb = '{"recorded": false}'::jsonb, 'the same device viewing again the same day is not recorded');
select pg_temp.ok(:'e3'::jsonb = '{"recorded": true}'::jsonb, 'a click is recorded separately from the view');
select pg_temp.ok(:'e4'::jsonb = '{"recorded": false}'::jsonb, 'a second click the same day is not recorded');
select pg_temp.ok(:'e5'::jsonb = '{"recorded": true}'::jsonb, 'another device viewing the same ad is recorded');
select pg_temp.ok(:'e6'::jsonb = '{"recorded": true}'::jsonb, 'an upper-case uuid viewer is accepted');
select pg_temp.ok((select count(*) = 4 from ad_events where ad_id = :'p_a'), 'exactly the 4 recorded events exist (duplicates left no row)');
select pg_temp.ok((select bool_and(day = (now() at time zone 'UTC')::date) from ad_events where ad_id = :'p_a'), 'events carry today''s UTC day');
select pg_temp.ok((select count(*) = 2 from ad_events where ad_id = :'p_a' and viewer_key = :'v1'), 'the viewer key is stored lower-case (view + click)');
select pg_temp.ok((select count(*) = 1 from ad_events where ad_id = :'p_a' and viewer_key = lower(:'vup')) and (select count(*) = 0 from ad_events where viewer_key <> lower(viewer_key)),
                  'an upper-case viewer is stored lower-cased');
set local role anon;
select record_ad_event(:'p_a'::uuid, 'view', lower(:'vup'))::text as e7 \gset
select record_ad_event(:'p_a'::uuid, 'view', :'vup')::text as e8 \gset
reset role;
select pg_temp.ok(:'e7'::jsonb = '{"recorded": false}'::jsonb and :'e8'::jsonb = '{"recorded": false}'::jsonb, 'upper-case and lower-case forms of the same viewer dedupe to one row');
select pg_temp.ok((select count(*) = 4 from ad_events where ad_id = :'p_a'), 'still exactly 4 events after the case variants');
set local role anon;
select pg_temp.throws_detail(format('select record_ad_event(%L, ''like'', %L)', :'p_a', :'v1'), 'FUELOS_BAD_REQUEST', 'kind', 'kind like is rejected');
select pg_temp.throws_detail(format('select record_ad_event(%L, null, %L)', :'p_a', :'v1'), 'FUELOS_BAD_REQUEST', 'kind', 'a null kind is rejected');
select pg_temp.throws_detail(format('select record_ad_event(%L, ''VIEW'', %L)', :'p_a', :'v1'), 'FUELOS_BAD_REQUEST', 'kind', 'kind is case-sensitive');
select pg_temp.throws_detail(format('select record_ad_event(%L, ''view'', ''abc'')', :'p_a'), 'FUELOS_BAD_REQUEST', 'viewer', 'viewer abc is rejected');
select pg_temp.throws_detail(format('select record_ad_event(%L, ''view'', '''')', :'p_a'), 'FUELOS_BAD_REQUEST', 'viewer', 'an empty viewer is rejected');
select pg_temp.throws_detail(format('select record_ad_event(%L, ''view'', %L)', :'p_a', repeat('a', 500)), 'FUELOS_BAD_REQUEST', 'viewer', 'a 500-char viewer is rejected');
select pg_temp.throws_detail(format('select record_ad_event(%L, ''view'', null)', :'p_a'), 'FUELOS_BAD_REQUEST', 'viewer', 'a null viewer is rejected');
select pg_temp.throws_detail(format('select record_ad_event(%L, ''view'', %L)', :'p_a', :'v1' || 'x'), 'FUELOS_BAD_REQUEST', 'viewer', 'a uuid with trailing junk is rejected');
select pg_temp.throws_detail(format('select record_ad_event(%L, ''view'', %L)', :'p_a', E'\n' || :'v1'), 'FUELOS_BAD_REQUEST', 'viewer', 'a uuid with a leading newline is rejected');
select pg_temp.throws_detail(format('select record_ad_event(%L, ''view'', %L)', :'p_a', :'v1' || E'\n'), 'FUELOS_BAD_REQUEST', 'viewer', 'a uuid with a trailing newline is rejected');
select pg_temp.throws_detail(format('select record_ad_event(%L, ''view'', ''zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz'')', :'p_a'), 'FUELOS_BAD_REQUEST', 'viewer', 'a non-hex uuid-shaped viewer is rejected');
select pg_temp.throws_detail('select record_ad_event(gen_random_uuid(), ''like'', ''abc'')', 'FUELOS_BAD_REQUEST', 'kind', 'kind is validated before viewer and before the ad lookup');
select pg_temp.throws_detail('select record_ad_event(gen_random_uuid(), ''view'', ''abc'')', 'FUELOS_BAD_REQUEST', 'viewer', 'viewer is validated before the ad lookup (unknown ad)');
select record_ad_event(:'p_pau'::uuid, 'view', :'v3')::text as f1 \gset
select record_ad_event(:'p_arc'::uuid, 'view', :'v3')::text as f2 \gset
select record_ad_event(:'p_sch'::uuid, 'view', :'v3')::text as f3 \gset
select record_ad_event(:'p_end'::uuid, 'view', :'v3')::text as f4 \gset
select record_ad_event(gen_random_uuid(), 'view', :'v3')::text as f5 \gset
select record_ad_event(null, 'view', :'v3')::text as f6 \gset
reset role;
select pg_temp.ok(:'f1'::jsonb = '{"recorded": false}'::jsonb, 'a paused ad records nothing');
select pg_temp.ok(:'f2'::jsonb = '{"recorded": false}'::jsonb, 'an archived ad records nothing');
select pg_temp.ok(:'f3'::jsonb = '{"recorded": false}'::jsonb, 'a scheduled ad records nothing');
select pg_temp.ok(:'f4'::jsonb = '{"recorded": false}'::jsonb, 'an ended ad records nothing');
select pg_temp.ok(:'f5'::jsonb = '{"recorded": false}'::jsonb, 'an unknown ad records nothing');
select pg_temp.ok(:'f6'::jsonb = '{"recorded": false}'::jsonb, 'a null ad id records nothing');
select pg_temp.ok((select count(*) = 0 from ad_events where ad_id in (:'p_pau', :'p_arc', :'p_sch', :'p_end')), 'no event rows exist for non-active ads');
select pg_temp.ok((select count(*) = 4 from ad_events), 'rejected and ignored calls left ad_events unchanged');
-- an authenticated user can record too
set local role authenticated;
select pg_temp.act_as(:'owner');
select record_ad_event(:'p_b'::uuid, 'view', :'v3')::text as g1 \gset
reset role;
select pg_temp.ok(:'g1'::jsonb = '{"recorded": true}'::jsonb, 'an authenticated user can record an event');
-- same device, yesterday + today both count
update ad_events set day = day - 1 where ad_id = :'p_b' and viewer_key = :'v3';
set local role anon;
select record_ad_event(:'p_b'::uuid, 'view', :'v3')::text as g2 \gset
select record_ad_event(:'p_b'::uuid, 'view', :'v3')::text as g3 \gset
reset role;
select pg_temp.ok(:'g2'::jsonb = '{"recorded": true}'::jsonb and :'g3'::jsonb = '{"recorded": false}'::jsonb, 'with yesterday''s row present, today''s view of the same device is recorded once');
select pg_temp.ok((select count(*) = 2 and count(distinct day) = 2 from ad_events where ad_id = :'p_b' and kind = 'view' and viewer_key = :'v3'), 'a backdated yesterday row and today''s row both exist');
-- a click needs a link; a valid click also records the viewer's missing same-day view (so clicks never exceed views)
select gen_random_uuid()::text as v4, gen_random_uuid()::text as v5 \gset
set local role anon;
select record_ad_event(:'p_b'::uuid, 'click', :'v2')::text as h1 \gset
select record_ad_event(:'p_b'::uuid, 'click', upper(:'v2'))::text as h2 \gset
select record_ad_event(:'p_b'::uuid, 'view', :'v2')::text as h3 \gset
reset role;
select pg_temp.ok(:'h1'::jsonb = '{"recorded": true}'::jsonb, 'a click with no prior view is recorded');
select pg_temp.ok((select count(*) filter (where kind = 'view') = 1 and count(*) filter (where kind = 'click') = 1 from ad_events where ad_id = :'p_b' and viewer_key = :'v2'),
                  'the click also created the missing same-day view row (one view, one click)');
select pg_temp.ok(:'h2'::jsonb = '{"recorded": false}'::jsonb, 'a second click (any letter case) is not recorded');
select pg_temp.ok(:'h3'::jsonb = '{"recorded": false}'::jsonb, 'the view already created by the click is not recorded again');
insert into ad_events (ad_id, kind, day, viewer_key) values (:'p_b', 'view', (now() at time zone 'UTC')::date - 1, :'v4');
set local role anon;
select record_ad_event(:'p_b'::uuid, 'click', :'v4')::text as h5 \gset
reset role;
select pg_temp.ok(:'h5'::jsonb = '{"recorded": true}'::jsonb
                    and (select count(*) = 2 from ad_events where ad_id = :'p_b' and viewer_key = :'v4' and kind = 'view')
                    and (select count(*) = 1 from ad_events where ad_id = :'p_b' and viewer_key = :'v4' and kind = 'click' and day = (now() at time zone 'UTC')::date),
                  'yesterday''s view does not count for today: the click adds today''s view and its own row');
select pg_temp.ok((select (count(*) filter (where kind = 'click')) <= (count(*) filter (where kind = 'view')) from ad_events where ad_id in (:'p_a', :'p_b')), 'clicks never exceed views');
-- p_a2 has no link: not clickable, but still viewable
set local role anon;
select record_ad_event(:'p_a2'::uuid, 'click', :'v5')::text as k1 \gset
reset role;
select pg_temp.ok(:'k1'::jsonb = '{"recorded": false}'::jsonb and (select count(*) = 0 from ad_events where ad_id = :'p_a2'), 'a click on an ad without a link is not recorded and writes nothing (not even a view)');
set local role anon;
select record_ad_event(:'p_a2'::uuid, 'view', :'v5')::text as k2 \gset
reset role;
select pg_temp.ok(:'k2'::jsonb = '{"recorded": true}'::jsonb, 'an ad without a link can still be viewed');
delete from ad_events where ad_id in (:'p_a2', :'p_b') and viewer_key in (:'v2', :'v4', :'v5');
-- circuit breaker: the size budget is one helper that record_ad_event compares against
select pg_temp.ok(ad_events_budget_bytes() = 104857600, 'the ad_events budget is 100 MB');
select pg_temp.ok((select proconfig @> array['search_path=public, pg_temp'] from pg_proc where oid = 'public.ad_events_budget_bytes()'::regprocedure), 'the budget helper pins its search_path');
select pg_temp.ok((select pg_get_functiondef('public.record_ad_event(uuid,text,text)'::regprocedure) like '%pg_total_relation_size(''public.ad_events'')%ad_events_budget_bytes()%'),
                  'record_ad_event compares pg_total_relation_size(ad_events) with ad_events_budget_bytes()');
-- simulate a full table: the (rolled-back) test shrinks the budget to 0, then restores it
create or replace function ad_events_budget_bytes() returns bigint language sql immutable set search_path = public, pg_temp as $$ select 0::bigint $$;
select count(*) as n_ev from ad_events \gset
set local role anon;
select record_ad_event(:'p_a'::uuid, 'view', :'v5')::text as m1 \gset
select record_ad_event(:'p_b'::uuid, 'click', :'v5')::text as m2 \gset
select pg_temp.throws_detail(format('select record_ad_event(%L, ''like'', %L)', :'p_a', :'v5'), 'FUELOS_BAD_REQUEST', 'kind', 'a full table still validates kind first');
select pg_temp.throws_detail(format('select record_ad_event(%L, ''view'', ''abc'')', :'p_a'), 'FUELOS_BAD_REQUEST', 'viewer', 'a full table still validates the viewer first');
reset role;
create or replace function ad_events_budget_bytes() returns bigint language sql immutable set search_path = public, pg_temp as $$ select 104857600::bigint $$;
select pg_temp.ok(:'m1'::jsonb = '{"recorded": false}'::jsonb and :'m2'::jsonb = '{"recorded": false}'::jsonb and (select count(*) = :n_ev from ad_events), 'when ad_events is over budget nothing is recorded');
set local role anon;
select record_ad_event(:'p_a'::uuid, 'view', :'v5')::text as m3 \gset
reset role;
select pg_temp.ok(:'m3'::jsonb = '{"recorded": true}'::jsonb, 'recording works again under budget');
delete from ad_events where viewer_key = :'v5';
-- grants
select pg_temp.ok((select not has_function_privilege('public', 'active_ads()', 'execute') and has_function_privilege('anon', 'active_ads()', 'execute')
                          and has_function_privilege('authenticated', 'active_ads()', 'execute') and has_function_privilege('service_role', 'active_ads()', 'execute')),
                  'active_ads: anon, authenticated, service_role may execute');
select pg_temp.ok((select has_function_privilege('anon', 'record_ad_event(uuid, text, text)', 'execute') and has_function_privilege('authenticated', 'record_ad_event(uuid, text, text)', 'execute')
                          and has_function_privilege('service_role', 'record_ad_event(uuid, text, text)', 'execute')
                          and not has_function_privilege('public', 'record_ad_event(uuid, text, text)', 'execute')),
                  'record_ad_event: anon, authenticated, service_role may execute');
select pg_temp.ok((select not has_function_privilege('anon', 'ad_stats(date, date)', 'execute') and not has_function_privilege('public', 'ad_stats(date, date)', 'execute')
                          and has_function_privilege('authenticated', 'ad_stats(date, date)', 'execute') and has_function_privilege('service_role', 'ad_stats(date, date)', 'execute')),
                  'ad_stats: authenticated + service_role only');

-- 9c. ad_stats
-- history so far (UTC today = T): p_a  T: 3 views + 1 click | p_b  T-1: 1 view, T: 1 view
-- added here:  p_a T-2: 2 views + 1 click | p_b T: 1 click | p_a2 T: 3 views + 1 click | p_end T: 1 click only (ended ad, no views)
--              p_arc (archived) T-1: 1 view + 1 click, T-500: 1 view (outside any 30-day window)
select (now() at time zone 'UTC')::date as today \gset
insert into ad_events (ad_id, kind, day, viewer_key) values
  (:'p_a', 'view', :'today'::date - 2, :'v1'), (:'p_a', 'view', :'today'::date - 2, :'v2'), (:'p_a', 'click', :'today'::date - 2, :'v1'),
  (:'p_b', 'click', :'today'::date, :'v3'),
  (:'p_a2', 'view', :'today'::date, :'v1'), (:'p_a2', 'view', :'today'::date, :'v2'), (:'p_a2', 'view', :'today'::date, :'v3'), (:'p_a2', 'click', :'today'::date, :'v1'),
  (:'p_end', 'click', :'today'::date, :'v1'),
  (:'p_arc', 'view', :'today'::date - 1, :'v1'), (:'p_arc', 'click', :'today'::date - 1, :'v1'), (:'p_arc', 'view', :'today'::date - 500, :'v2');
set local role authenticated;
select pg_temp.act_as(:'support');
select ad_stats(:'today'::date - 30, :'today'::date)::text as st \gset
select ad_stats(:'today'::date - 3, :'today'::date - 3)::text as st_none \gset
select ad_stats(:'today'::date - 2, :'today'::date - 2)::text as st_edge \gset
select ad_stats(:'today'::date - 500, :'today'::date - 500)::text as st_old \gset
select pg_temp.ok(jsonb_typeof(ad_stats(:'today'::date - 400, :'today'::date)->'rows') = 'array', 'a period of exactly 400 days is accepted');
select pg_temp.throws_detail(format('select ad_stats(%L::date, %L::date)', :'today'::date - 401, :'today'::date), 'FUELOS_BAD_REQUEST', 'period', 'a period of 401 days is rejected');
select pg_temp.throws_detail(format('select ad_stats(%L::date, %L::date)', :'today'::date, :'today'::date - 1), 'FUELOS_BAD_REQUEST', 'period', 'p_from after p_to is rejected');
select pg_temp.throws_detail(format('select ad_stats(null, %L::date)', :'today'::date), 'FUELOS_BAD_REQUEST', 'period', 'a null p_from is rejected');
select pg_temp.throws_detail(format('select ad_stats(%L::date, null)', :'today'::date), 'FUELOS_BAD_REQUEST', 'period', 'a null p_to is rejected');
select pg_temp.throws_detail(format('select ad_stats(''-infinity''::date, %L::date)', :'today'::date), 'FUELOS_BAD_REQUEST', 'period', 'p_from = -infinity is rejected');
select pg_temp.throws_detail(format('select ad_stats(%L::date, ''infinity''::date)', :'today'::date), 'FUELOS_BAD_REQUEST', 'period', 'p_to = infinity is rejected');
select pg_temp.throws_detail('select ad_stats(''-infinity''::date, ''infinity''::date)', 'FUELOS_BAD_REQUEST', 'period', 'an infinite period is rejected');
select pg_temp.act_as(:'admin');
select pg_temp.ok(jsonb_typeof(ad_stats(:'today'::date - 1, :'today'::date)->'rows') = 'array', 'platform admin can call ad_stats');
select pg_temp.act_as(:'owner');
select pg_temp.throws(format('select ad_stats(%L::date, %L::date)', :'today'::date - 1, :'today'::date), '42501', 'a station owner cannot read ad_stats');
select pg_temp.throws(format('select ad_stats(%L::date, %L::date)', :'today'::date, :'today'::date - 1), '42501', 'permission is checked before the period');
select pg_temp.act_as(:'attendant');
select pg_temp.throws(format('select ad_stats(%L::date, %L::date)', :'today'::date - 1, :'today'::date), '42501', 'an attendant cannot read ad_stats');
select pg_temp.act_as(null);
select pg_temp.throws(format('select ad_stats(%L::date, %L::date)', :'today'::date - 1, :'today'::date), '42501', 'a caller without a JWT cannot read ad_stats');
reset role;
set local role anon;
select pg_temp.throws(format('select ad_stats(%L::date, %L::date)', :'today'::date - 1, :'today'::date), '42501', 'anon cannot read ad_stats');
reset role;
create temp table _st as select :'st'::jsonb as j;
create temp table _st_none as select :'st_none'::jsonb as j;
create temp table _st_edge as select :'st_edge'::jsonb as j;
create temp table _st_old as select :'st_old'::jsonb as j;
select pg_temp.ok((select (select count(*) from jsonb_object_keys(j)) = 2 and jsonb_typeof(j->'rows') = 'array' and jsonb_typeof(j->'totals') = 'array' from _st), 'ad_stats returns exactly {rows, totals}');
select pg_temp.ok((select bool_and((select count(*) from jsonb_object_keys(r)) = 6 and r ?& array['ad_id', 'sponsor_name', 'title', 'day', 'views', 'clicks']) from _st, jsonb_array_elements(j->'rows') r),
                  'every stats row has exactly ad_id, sponsor_name, title, day, views, clicks');
select pg_temp.ok((select bool_and((select count(*) from jsonb_object_keys(t)) = 6 and t ?& array['ad_id', 'sponsor_name', 'title', 'views', 'clicks', 'ctr']) from _st, jsonb_array_elements(j->'totals') t),
                  'every totals row has exactly ad_id, sponsor_name, title, views, clicks, ctr');
select pg_temp.ok((select jsonb_array_length(j->'rows') = 7 and jsonb_array_length(j->'totals') = 5 from _st), 'the 30-day period has 7 per-day rows and 5 ad totals');
select pg_temp.ok((select (r->>'views')::int = 2 and (r->>'clicks')::int = 1 and r->>'sponsor_name' = 'P-run-a' and r->>'title' = 'run a'
                     from _st, jsonb_array_elements(j->'rows') r where r->>'ad_id' = :'p_a' and r->>'day' = (:'today'::date - 2)::text),
                  'rows: views and clicks per ad per day (T-2)');
select pg_temp.ok((select (r->>'views')::int = 3 and (r->>'clicks')::int = 1
                     from _st, jsonb_array_elements(j->'rows') r where r->>'ad_id' = :'p_a' and r->>'day' = :'today'),
                  'rows: views and clicks per ad per day (today)');
select pg_temp.ok((select (t->>'views')::int = 5 and (t->>'clicks')::int = 2 and (t->>'ctr')::numeric = 40.0 and t->>'title' = 'run a' and t->>'sponsor_name' = 'P-run-a'
                     from _st, jsonb_array_elements(j->'totals') t where t->>'ad_id' = :'p_a'), 'totals: p_a 5 views, 2 clicks, ctr 40.0');
select pg_temp.ok((select (t->>'views')::int = 2 and (t->>'clicks')::int = 1 and (t->>'ctr')::numeric = 50.0
                     from _st, jsonb_array_elements(j->'totals') t where t->>'ad_id' = :'p_b'), 'ctr for 1 click / 2 views = 50.0');
select pg_temp.ok((select (t->>'views')::int = 3 and (t->>'clicks')::int = 1 and (t->>'ctr')::numeric = 33.3
                     from _st, jsonb_array_elements(j->'totals') t where t->>'ad_id' = :'p_a2'), 'ctr is rounded to 1 decimal (1 / 3 = 33.3)');
select pg_temp.ok((select (t->>'views')::int = 0 and (t->>'clicks')::int = 1 and (t->>'ctr')::numeric = 0
                     from _st, jsonb_array_elements(j->'totals') t where t->>'ad_id' = :'p_end'), 'ctr is 0 when there are no views (no division by zero)');
select pg_temp.ok((select (t->>'views')::int = 1 and (t->>'clicks')::int = 1 and (t->>'ctr')::numeric = 100.0 and t->>'sponsor_name' = 'P-arch'
                     from _st, jsonb_array_elements(j->'totals') t where t->>'ad_id' = :'p_arc'), 'an archived ad''s history is included (ctr 100.0)');
select pg_temp.ok((select count(*) = 0 from _st, jsonb_array_elements(j->'rows') r where r->>'day' < (:'today'::date - 30)::text), 'the 500-day-old event is outside the period');
select pg_temp.ok((select (select sum((r->>'views')::int) from jsonb_array_elements(j->'rows') r) = (select sum((t->>'views')::int) from jsonb_array_elements(j->'totals') t)
                          and (select sum((r->>'clicks')::int) from jsonb_array_elements(j->'rows') r) = (select sum((t->>'clicks')::int) from jsonb_array_elements(j->'totals') t)
                     from _st), 'totals equal the sum of rows (views and clicks)');
select pg_temp.ok((select j = '{"rows": [], "totals": []}'::jsonb from _st_none), 'ad_stats returns empty arrays when nothing is in the period');
select pg_temp.ok((select jsonb_array_length(j->'rows') = 1 and jsonb_array_length(j->'totals') = 1 and j->'rows'->0->>'day' = (:'today'::date - 2)::text from _st_edge),
                  'a one-day period (p_from = p_to) includes that day');
select pg_temp.ok((select jsonb_array_length(j->'rows') = 1 and j->'totals'->0->>'ad_id' = :'p_arc' from _st_old), 'the period bounds are inclusive on both ends');

\o
select 'PASS 94_sponsor_ads_test';
rollback;
