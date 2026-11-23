-- Each round counts from the day the round before was actually done (owner's decision 2026-11-23, overriding the
-- brief's fixed days), keeping the brief's gaps; a customer who enters late starts at round 1 instead of being skipped
-- ahead. Rules: docs/superpowers/specs/2026-11-23-followup-count-from-done-design.md (mirrors nextDue in schedule.ts)

-- round 1: day 2, or the day the customer entered the queue if later; round r: the day round r − 1 was saved + the gap
create function fu_round_due(p_lead uuid, p_round int) returns date
language sql stable security definer set search_path = public as $$
  select case
    when p_round = 1 then greatest(l.first_day + 1, (l.created_at at time zone 'Asia/Bangkok')::date)
    else coalesce(
      (select (e.at at time zone 'Asia/Bangkok')::date from fu_events e
       where e.lead_id = l.id and e.kind in ('round', 'skip') and e.round_no = p_round - 1 order by e.id limit 1)
        + (array[1, 3, 2, 7, 16, 15, 15])[p_round],
      fu_due_day(l.first_day, p_round))
  end
  from fu_leads l where l.id = p_lead
$$;

-- the due day stored with a round or skip is the one in force when it was saved (create or replace keeps the grants)
create or replace function fu_record_round(p_actor uuid, p_lead uuid, p_version int, p_round int, p_result text, p_note text, p_order text) returns int
language plpgsql security definer set search_path = public as $$
declare me staff := fu_actor(p_actor); l fu_leads;
begin
  l := fu_lock(p_lead, p_version);
  if l.status <> 'active' then raise exception 'ลูกค้ารายนี้ไม่ได้อยู่ระหว่างติดตาม'; end if;
  if p_round is distinct from fu_next_round(l.id) then raise exception 'ต้องบันทึกตามลำดับรอบ (รอบถัดไปคือรอบ %)', fu_next_round(l.id); end if;
  if coalesce(p_result, '') not in ('sent', 'waiting', 'won', 'optout') then raise exception 'เลือกผลการติดตาม'; end if;
  insert into fu_events (lead_id, kind, round_no, result, due_day, note, order_id, by)
  values (l.id, 'round', p_round, p_result, fu_round_due(l.id, p_round), trim(coalesce(p_note, '')),
          nullif(trim(coalesce(p_order, '')), ''), me.id);
  if p_result = 'won' then
    update fu_leads set status = 'won' where id = l.id;
    perform fu_attach_order(me, l.id, p_order);
  elsif p_result = 'optout' then
    update fu_leads set status = 'optout' where id = l.id;
  end if;
  return fu_touch(l.id, me);
end $$;

create or replace function fu_skip_round(p_actor uuid, p_lead uuid, p_version int, p_round int, p_reason text) returns int
language plpgsql security definer set search_path = public as $$
declare me staff := fu_actor(p_actor); l fu_leads;
begin
  l := fu_lock(p_lead, p_version);
  if l.status <> 'active' then raise exception 'ลูกค้ารายนี้ไม่ได้อยู่ระหว่างติดตาม'; end if;
  if p_round is distinct from fu_next_round(l.id) then raise exception 'ข้ามได้เฉพาะรอบถัดไป (รอบ %)', fu_next_round(l.id); end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'ระบุเหตุผลที่ข้ามรอบ'; end if;
  insert into fu_events (lead_id, kind, round_no, due_day, note, by)
  values (l.id, 'skip', p_round, fu_round_due(l.id, p_round), trim(p_reason), me.id);
  return fu_touch(l.id, me);
end $$;

-- the sync no longer skips past rounds for customers it adds (create or replace keeps the grants)
create or replace function fu_sync_core() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  n_added int := 0; n_linked int := 0; n_rounds int := 0; n_skipped int := 0; n_won int := 0; -- 'skipped' stays in the result, always 0 since 0009
  c record; v_day date; v_cands uuid[]; v_owner uuid; v_product text; v_page text; v_url text; v_id uuid;
  new_ids uuid[] := '{}'; v_touched uuid[];
begin
  -- two uploads or two open tabs at once must not add the same chat twice
  perform pg_advisory_xact_lock(hashtext('fu_sync'));

  -- customers added by hand whose chat link is a chat we have: link them instead of adding a second one
  -- one chat per customer and one customer per chat (a chat's link can change between exports)
  with pairs as (
    select l.id, l.created_at, cv.conversation_id, cv.day
    from fu_leads l join conversations cv on cv.pancake_url = l.chat_url
    where l.conversation_id is null and l.chat_url <> ''
      and not exists (select 1 from fu_leads o where o.conversation_id = cv.conversation_id)),
  per_lead as (select distinct on (id) id, created_at, conversation_id from pairs order by id, day desc),
  m as (select distinct on (conversation_id) id, conversation_id from per_lead order by conversation_id, created_at, id)
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

    select btrim(s.tag) into v_product from conv_tag_seen s
    where s.conversation_id = c.conversation_id and fu_is_product(s.tag)
    order by fu_tag_day(s.conversation_id, s.tag) nulls last, s.tag
    limit 1;
    v_product := coalesce(v_product, 'ไม่ระบุ');

    select cv.page_id, cv.pancake_url into v_page, v_url from conversations cv
    where cv.conversation_id = c.conversation_id order by cv.day desc limit 1;
    if v_url is null or v_url !~* '^https?://' or length(v_url) > 350 or exists (select 1 from fu_leads where chat_url = v_url) then
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
    select id, 'round', r, 'tag', fu_due_day(first_day, r), least(coalesce((td + time '12:00') at time zone 'Asia/Bangkok', now()), now())
    from r
    on conflict (lead_id, round_no) where kind in ('round', 'skip') do nothing
    returning lead_id)
  select count(*), coalesce(array_agg(distinct lead_id), '{}') into n_rounds, v_touched from ins;
  update fu_leads set version = version + 1, updated_at = now() where id = any (v_touched);

  -- customers who enter late are no longer skipped ahead: they start at round 1, due the day they entered

  -- a close tag first seen after the customer entered the queue = bought (the order number is added by hand),
  -- dated the day the tag appeared. A status someone set on or after that day wins: a reopened customer stays open.
  with cand as (
    select l.id, min(s.first_day) as cd
    from fu_leads l join conv_tag_seen s on s.conversation_id = l.conversation_id
    where l.status = 'active' and btrim(s.tag) in ('ปิด', 'ปิดAds', 'ปิดOrganic')
      and not s.baseline and s.first_day > l.first_day
    group by l.id),
  w as (
    update fu_leads l set status = 'won', version = version + 1, updated_at = now()
    from cand k
    where l.id = k.id
      and not exists (select 1 from fu_events e
                      where e.lead_id = l.id and e.kind = 'status' and (e.at at time zone 'Asia/Bangkok')::date >= k.cd)
    returning l.id, k.cd)
  insert into fu_events (lead_id, kind, result, note, at)
  select id, 'status', 'won', 'จากแท็กปิดใน Pancake', least((cd + time '12:00') at time zone 'Asia/Bangkok', now()) from w;
  get diagnostics n_won = row_count;

  return jsonb_build_object('added', n_added, 'linked', n_linked, 'rounds', n_rounds, 'skipped', n_skipped, 'won', n_won);
end $$;

-- a silent chat started by hand: round 1 now, no skipped rounds, day 1 is the real first day (keeps the grant)
create or replace function fu_start_chat(p_actor uuid, p_conv text, p_result text, p_note text, p_order text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me staff := fu_actor(p_actor);
  v_first date; v_owner uuid; v_cands uuid[]; v_product text; v_page text; v_url text; v_id uuid; v_version int;
begin
  -- the same lock as the sync: a chat must not be added twice by a tap and an upload at the same moment
  perform pg_advisory_xact_lock(hashtext('fu_sync'));
  if coalesce(p_result, '') not in ('sent', 'waiting', 'won', 'optout') then raise exception 'เลือกผลการติดตาม'; end if;
  if exists (select 1 from fu_leads where conversation_id = p_conv) then
    raise exception 'แชทนี้อยู่ในคิวติดตามแล้ว กดโหลดใหม่';
  end if;

  select min(day) into v_first from conversations where conversation_id = p_conv;
  if v_first is null then raise exception 'ไม่พบแชทนี้ในไฟล์ข้อความ กดโหลดใหม่'; end if;
  -- day 1 is the first day we saw the chat; round 1 is recorded now, the next rounds count from today

  if me.role = 'admin' then
    v_owner := me.id;
  else
    -- as fu_sync_core: the admin whose name tag came first; none (or a tie) → the admin with fewer active customers
    with a as (
      select st.id, fu_tag_day(s.conversation_id, s.tag) as td
      from conv_tag_seen s
      join staff st on st.role = 'admin' and st.active
        and st.name = case btrim(s.tag) when 'พี่ก้อย' then 'พี่ก้อย' when 'นุ่น🤍' then 'นุ่น' end
      where s.conversation_id = p_conv)
    select coalesce(array_agg(id), '{}') into v_cands from a where td is not distinct from (select min(td) from a);
    select st.id into v_owner from staff st
    where st.role = 'admin' and st.active and (cardinality(v_cands) = 0 or st.id = any (v_cands))
    order by (select count(*) from fu_leads l where l.owner_id = st.id and l.status = 'active'), st.name
    limit 1;
    if v_owner is null then raise exception 'ยังไม่มีแอดมินในทีม เพิ่มรายชื่อทีมก่อน'; end if;
  end if;

  select btrim(s.tag) into v_product from conv_tag_seen s
  where s.conversation_id = p_conv and fu_is_product(s.tag)
  order by fu_tag_day(s.conversation_id, s.tag) nulls last, s.tag
  limit 1;
  v_product := coalesce(v_product, 'ไม่ระบุ');

  select cv.page_id, cv.pancake_url into v_page, v_url from conversations cv
  where cv.conversation_id = p_conv order by cv.day desc limit 1;
  if v_url is null or v_url !~* '^https?://' or length(v_url) > 350 or exists (select 1 from fu_leads where chat_url = v_url) then
    v_url := '';
  end if;

  -- started by hand: the team wants it back even if it was deleted from the queue before
  delete from fu_sync_ignored where conversation_id = p_conv;

  insert into fu_leads (name, product, owner_id, first_day, page_id, chat_url, conversation_id, source, created_by, updated_by)
  values (left(fu_page_name(v_page) || ' · ' || v_product || ' · #' || right(p_conv, 4), 120),
          left(v_product, 80), v_owner, v_first,
          case when v_page in ('100379779472465', '516356078238016', '923678677500634', 'igo_17841457670184062') then v_page end,
          v_url, p_conv, 'chat', me.id, me.id)
  returning id, version into v_id, v_version;
  insert into fu_events (lead_id, kind, note, by) values (v_id, 'create', 'เริ่มติดตามจากแชทเงียบ', me.id);

  perform fu_record_round(p_actor, v_id, v_version, 1, p_result, p_note, p_order);
  return v_id;
end $$;

-- system skips from before: removed where only other system skips come after them, so those customers start at
-- round 1; customers with a later round recorded keep theirs (rounds stay in order). The version bump makes an open
-- screen reload instead of saving against the old rounds.
with gone as (
  delete from fu_events a
  where a.kind = 'skip' and a.by is null and a.note = 'เข้าระบบทีหลัง'
    and not exists (
      select 1 from fu_events x
      where x.lead_id = a.lead_id and x.kind in ('round', 'skip') and x.round_no > a.round_no
        and not (x.kind = 'skip' and x.by is null and x.note = 'เข้าระบบทีหลัง'))
  returning a.lead_id)
update fu_leads set version = version + 1, updated_at = now() where id in (select lead_id from gone);

-- only the function created here; functions from earlier migrations and other apps keep their grants
revoke execute on function fu_round_due(uuid, int) from public, anon, authenticated;
