-- Topics only: raw message text is never sent to this RPC.
-- Derived from the repository's existing save_messages; confirm against live definition before applying.
begin;

alter table public.conversations add column topics text[] not null default '{}';

create or replace function save_messages(p_code text, p_file text, p_convs jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform assert_code(p_code);

  drop table if exists pg_temp.incoming;
  create temp table incoming on commit drop as
  select x.day, x.conversation_id, x.page_id, x.first_at, x.last_at, x.msg_count, x.first_kind, x.has_phone,
         array(select jsonb_array_elements_text(x.tags)) as tags, coalesce(x.pancake_url, '') as pancake_url,
         array(select jsonb_array_elements_text(coalesce(x.topics, '[]'::jsonb))) as topics
  from jsonb_to_recordset(p_convs) as x(day date, conversation_id text, page_id text, first_at timestamptz,
       last_at timestamptz, msg_count int, first_kind text, has_phone boolean, tags jsonb, pancake_url text, topics jsonb);

  delete from conversations c
  using (select distinct day, page_id from incoming) k
  where c.day = k.day and c.page_id = k.page_id;

  insert into conversations (day, conversation_id, page_id, first_at, last_at, msg_count, first_kind, has_phone, tags, pancake_url, topics)
  select day, conversation_id, page_id, first_at, last_at, msg_count, first_kind, has_phone, tags, pancake_url, topics
  from incoming
  on conflict (day, conversation_id) do update set
    page_id = excluded.page_id, first_at = excluded.first_at, last_at = excluded.last_at, msg_count = excluded.msg_count,
    first_kind = excluded.first_kind, has_phone = excluded.has_phone, tags = excluded.tags, pancake_url = excluded.pancake_url, topics = excluded.topics;
  get diagnostics n = row_count;

  -- A tag is "baseline" (date unknown) on the page's first message day, and for a chat we have never seen
  -- that does not carry that day's date tag (a returning customer whose tags may be old).
  insert into conv_tag_seen (conversation_id, tag, first_day, baseline)
  select s.conversation_id, s.tag, case when s.baseline then null else s.day end, s.baseline
  from (
    select distinct on (i.conversation_id, t.tag) i.conversation_id, t.tag, i.day,
      (not exists (select 1 from conversations c where c.page_id = i.page_id and c.day < i.day))
      or (not exists (select 1 from conversations c where c.conversation_id = i.conversation_id and c.day < i.day)
          and not ((extract(day from i.day)::int || '/' || extract(month from i.day)::int) = any (i.tags))) as baseline
    from incoming i, unnest(i.tags) as t(tag)
    order by i.conversation_id, t.tag, i.day
  ) s
  on conflict (conversation_id, tag) do update set
    baseline = conv_tag_seen.baseline or excluded.baseline,
    first_day = case when conv_tag_seen.baseline or excluded.baseline then null
                     else least(conv_tag_seen.first_day, excluded.first_day) end;

  insert into uploads (kind, file_name, day_from, day_to, page_ids, rows)
  select 'messages', p_file, min(day), max(day), array(select distinct page_id from incoming), n from incoming;
  return n;
end $$;

revoke execute on function save_messages(text,text,jsonb) from public;
grant execute on function save_messages(text,text,jsonb) to anon, authenticated;

alter table public.customer_quotes drop constraint customer_quotes_category_check;
alter table public.customer_quotes add constraint customer_quotes_category_check check (category in (
  'ราคา/แพง', 'ไม่มั่นใจ/ขอรีวิว', 'อาการ/สุขภาพ', 'กลัวผลข้างเคียง', 'ส่งของ/จ่ายเงิน', 'ขอคิดก่อน', 'เทียบยี่ห้ออื่น', 'คำชม', 'อื่นๆ'));

commit;
