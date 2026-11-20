-- A silent chat from the follow list (ต้องตามวันนี้) enters the follow-up queue when someone records a result for it.
-- One call adds the customer the way fu_sync_core does, skips rounds already past, and records the result as the next
-- round through fu_record_round. Rules: docs/superpowers/specs/2026-11-20-silent-chats-in-followup-design.md

alter table fu_leads drop constraint fu_leads_source_check;
alter table fu_leads add constraint fu_leads_source_check check (source in ('manual', 'tag', 'chat'));

create function fu_start_chat(p_actor uuid, p_conv text, p_result text, p_note text, p_order text) returns uuid
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
  -- day 1 is the first day we saw the chat, but never so long ago that all seven rounds are gone
  v_first := greatest(v_first, fu_bkk_today() - 59);

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

  -- rounds already past are skipped by the system, as for customers the sync adds
  insert into fu_events (lead_id, kind, round_no, due_day, note)
  select v_id, 'skip', g.r, fu_due_day(v_first, g.r), 'เข้าระบบทีหลัง'
  from generate_series(1, 7) as g(r)
  where fu_due_day(v_first, g.r) < fu_bkk_today();

  perform fu_record_round(p_actor, v_id, v_version, fu_next_round(v_id), p_result, p_note, p_order);
  return v_id;
end $$;

-- only the function created here; functions from earlier migrations and other apps keep their grants
revoke execute on function fu_start_chat(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function fu_start_chat(uuid, text, text, text, text) to authenticated;
