-- Chats the team tags ติดตาม in Pancake enter the follow-up queue by themselves. Every message upload (upload
-- code) and every load of the follow-up tabs (team sign-in) runs fu_sync_core(), which reads conversations and
-- conv_tag_seen and writes fu_leads / fu_events. It never stores customer names, phones or message text.
-- Rules: docs/superpowers/specs/2026-11-16-followup-auto-intake-design.md
begin;

alter table fu_leads add column conversation_id text;
alter table fu_leads add column source text not null default 'manual' check (source in ('manual', 'tag'));
create unique index fu_leads_conversation on fu_leads (conversation_id) where conversation_id is not null;

alter table fu_events drop constraint fu_events_kind_check;
alter table fu_events add constraint fu_events_kind_check
  check (kind in ('create', 'edit', 'round', 'skip', 'status', 'reassign', 'order', 'import', 'auto'));

-- chats whose customer was deleted in the web; the sync never adds them again
create table fu_sync_ignored (
  conversation_id text primary key,
  at timestamptz not null default now()
);
alter table fu_sync_ignored enable row level security;
revoke all on fu_sync_ignored from anon, authenticated;

-- ติดตาม = in the queue, ติดตามN (2..7) = rounds 1..N done; anything else is not a follow tag
create function fu_follow_no(p_tag text) returns int
language sql immutable as $$
  select case when btrim(p_tag) = 'ติดตาม' then 0
              when btrim(p_tag) ~ '^ติดตาม[2-7]$' then right(btrim(p_tag), 1)::int end
$$;

-- the day a tag was first seen on a chat; a baseline tag (date unknown) falls back to the first export carrying it
create function fu_tag_day(p_conv text, p_tag text) returns date
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select first_day from conv_tag_seen where conversation_id = p_conv and tag = p_tag),
    (select min(day) from conversations where conversation_id = p_conv and p_tag = any (tags)))
$$;

-- product tags as in src/grouping/rules.ts, unless the team regrouped them on the web
create function fu_is_product(p_tag text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select grp = 'สินค้า' from tag_groups where tag = p_tag),
                  p_tag in ('มะกอก', 'เดลี่ ออยล์', 'Gluta', 'Magnesium'))
$$;

-- copy of src/config/pages.ts
create function fu_page_name(p_page text) returns text
language sql immutable as $$
  select case p_page
    when '100379779472465' then 'Hylme (Facebook)' when '516356078238016' then 'ครบจบเรื่องไขมัน'
    when '923678677500634' then 'ครบจบเรื่องนอน' when 'igo_17841457670184062' then 'Hylme (IG)'
    else 'ไม่ทราบเพจ' end
$$;

create function fu_sync_core() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  n_added int := 0; n_linked int := 0; n_rounds int := 0; n_skipped int := 0; n_won int := 0;
  c record; v_day date; v_cands uuid[]; v_owner uuid; v_product text; v_page text; v_url text; v_id uuid;
  new_ids uuid[] := '{}'; v_touched uuid[];
begin
  -- two uploads or two open tabs at once must not add the same chat twice
  perform pg_advisory_xact_lock(hashtext('fu_sync'));

  -- customers added by hand whose chat link is a chat we have: link them instead of adding a second one
  with m as (
    select distinct on (l.id) l.id, cv.conversation_id
    from fu_leads l join conversations cv on cv.pancake_url = l.chat_url
    where l.conversation_id is null and l.chat_url <> ''
      and not exists (select 1 from fu_leads o where o.conversation_id = cv.conversation_id)
    order by l.id, cv.day desc)
  update fu_leads l set conversation_id = m.conversation_id from m where l.id = m.id;
  get diagnostics n_linked = row_count;

  for c in
    select s.conversation_id, min(fu_tag_day(s.conversation_id, s.tag)) as d
    from conv_tag_seen s
    where fu_follow_no(s.tag) is not null
      and not exists (select 1 from fu_leads l where l.conversation_id = s.conversation_id)
      and not exists (select 1 from fu_sync_ignored i where i.conversation_id = s.conversation_id)
    group by s.conversation_id
    order by 2, 1
  loop
    v_day := coalesce(c.d, fu_bkk_today());

    -- bought on or before the day it was tagged (or with an old close tag): nothing to follow
    continue when exists (
      select 1 from conv_tag_seen s
      where s.conversation_id = c.conversation_id and btrim(s.tag) in ('ปิด', 'ปิดAds', 'ปิดOrganic')
        and (s.baseline or s.first_day <= v_day));

    -- owner: the admin whose name tag came first; none (or a tie) → the admin with fewer active customers
    with a as (
      select st.id, fu_tag_day(s.conversation_id, s.tag) as td
      from conv_tag_seen s
      join staff st on st.role = 'admin' and st.active
        and st.name = case btrim(s.tag) when 'พี่ก้อย' then 'พี่ก้อย' when 'นุ่น🤍' then 'นุ่น' end
      where s.conversation_id = c.conversation_id)
    select coalesce(array_agg(id), '{}') into v_cands from a where td is not distinct from (select min(td) from a);

    select st.id into v_owner from staff st
    where st.role = 'admin' and st.active and (cardinality(v_cands) = 0 or st.id = any (v_cands))
    order by (select count(*) from fu_leads l where l.owner_id = st.id and l.status = 'active'), st.name
    limit 1;
    continue when v_owner is null; -- nobody on the team to give it to

    select s.tag into v_product from conv_tag_seen s
    where s.conversation_id = c.conversation_id and fu_is_product(s.tag)
    order by fu_tag_day(s.conversation_id, s.tag) nulls last, s.tag
    limit 1;
    v_product := coalesce(v_product, 'ไม่ระบุ');

    select cv.page_id, cv.pancake_url into v_page, v_url from conversations cv
    where cv.conversation_id = c.conversation_id order by cv.day desc limit 1;
    if v_url is null or v_url = '' or length(v_url) > 350 or exists (select 1 from fu_leads where chat_url = v_url) then
      v_url := '';
    end if;

    insert into fu_leads (name, product, owner_id, first_day, page_id, chat_url, conversation_id, source)
    values (left(fu_page_name(v_page) || ' · ' || v_product || ' · #' || right(c.conversation_id, 4), 120),
            left(v_product, 80), v_owner, v_day,
            case when v_page in ('100379779472465', '516356078238016', '923678677500634', 'igo_17841457670184062') then v_page end,
            v_url, c.conversation_id, 'tag')
    returning id into v_id;
    insert into fu_events (lead_id, kind, note) values (v_id, 'auto', 'เข้าคิวอัตโนมัติจากแท็กติดตาม');
    new_ids := new_ids || v_id;
    n_added := n_added + 1;
  end loop;

  -- ติดตามN = rounds 1..N done, dated the day the earliest tag implying each round appeared; rounds the team
  -- recorded themselves stay as they are. The version bump makes an open screen reload instead of colliding.
  with t as (
    select l.id, l.first_day, fu_follow_no(s.tag) as n, fu_tag_day(s.conversation_id, s.tag) as td
    from fu_leads l join conv_tag_seen s on s.conversation_id = l.conversation_id
    where l.status = 'active' and fu_follow_no(s.tag) > 0),
  r as (
    select distinct on (t.id, g.r) t.id, t.first_day, g.r, t.td
    from t cross join lateral generate_series(1, t.n) as g(r)
    order by t.id, g.r, t.td nulls last),
  ins as (
    insert into fu_events (lead_id, kind, round_no, result, due_day, at)
    select id, 'round', r, 'tag', fu_due_day(first_day, r), coalesce((td + time '12:00') at time zone 'Asia/Bangkok', now())
    from r
    on conflict (lead_id, round_no) where kind in ('round', 'skip') do nothing
    returning lead_id)
  select count(*), coalesce(array_agg(distinct lead_id), '{}') into n_rounds, v_touched from ins;
  update fu_leads set version = version + 1, updated_at = now() where id = any (v_touched);

  -- only for customers added just now: rounds already past are skipped, so the queue does not open full of red
  insert into fu_events (lead_id, kind, round_no, due_day, note)
  select l.id, 'skip', g.r, fu_due_day(l.first_day, g.r), 'เข้าระบบทีหลัง'
  from fu_leads l cross join generate_series(1, 7) as g(r)
  where l.id = any (new_ids) and fu_due_day(l.first_day, g.r) < fu_bkk_today()
  on conflict (lead_id, round_no) where kind in ('round', 'skip') do nothing;
  get diagnostics n_skipped = row_count;

  -- a close tag first seen after the customer entered the queue = bought (the order number is added by hand)
  with w as (
    update fu_leads l set status = 'won', version = version + 1, updated_at = now()
    where l.status = 'active' and l.conversation_id is not null
      and exists (select 1 from conv_tag_seen s
                  where s.conversation_id = l.conversation_id and btrim(s.tag) in ('ปิด', 'ปิดAds', 'ปิดOrganic')
                    and not s.baseline and s.first_day > l.first_day)
    returning l.id)
  insert into fu_events (lead_id, kind, result, note) select id, 'status', 'won', 'จากแท็กปิดใน Pancake' from w;
  get diagnostics n_won = row_count;

  return jsonb_build_object('added', n_added, 'linked', n_linked, 'rounds', n_rounds, 'skipped', n_skipped, 'won', n_won);
end $$;

-- after a message upload; uses the same upload code as save_messages
create function fu_sync_upload(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform assert_code(p_code);
  return fu_sync_core();
end $$;

-- when the follow-up tabs load, in case an upload's sync failed
create function fu_sync_team() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบก่อน'; end if;
  if not fu_member() then raise exception 'บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้ระบบติดตาม ติดต่อเจ้าของระบบ'; end if;
  return fu_sync_core();
end $$;

-- deleting a customer that came from a chat remembers the chat, so the sync does not bring it back
-- (create or replace keeps the grant from 0005)
create or replace function fu_delete_lead(p_actor uuid, p_lead uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform fu_actor(p_actor);
  insert into fu_sync_ignored (conversation_id)
  select conversation_id from fu_leads where id = p_lead and conversation_id is not null
  on conflict do nothing;
  delete from fu_leads where id = p_lead;
end $$;

-- only the functions created here; functions from earlier migrations and other apps keep their grants
revoke execute on function fu_follow_no(text), fu_tag_day(text, text), fu_is_product(text), fu_page_name(text),
  fu_sync_core(), fu_sync_upload(text), fu_sync_team()
  from public, anon, authenticated;
grant execute on function fu_sync_upload(text) to anon, authenticated;
grant execute on function fu_sync_team() to authenticated;

commit;
