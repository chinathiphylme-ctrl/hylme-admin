-- Hylme admin dashboard: aggregates only, no customer PII.
-- Reads: anon under read-only RLS. Writes: security definer RPCs that check the upload code.

create extension if not exists pgcrypto with schema extensions;

create table tag_daily (
  day date not null,
  page_id text not null,
  tag text not null,
  color text not null default '',
  count int not null default 0,
  primary key (day, page_id, tag)
);

create table tag_groups (
  tag text primary key,
  grp text,
  ad_name text,
  updated_at timestamptz not null default now()
);

create table conversations (
  day date not null,
  conversation_id text not null,
  page_id text not null,
  first_at timestamptz not null,
  last_at timestamptz not null,
  msg_count int not null,
  first_kind text not null check (first_kind in ('button', 'typed', 'media')),
  has_phone boolean not null default false,
  tags text[] not null default '{}',
  pancake_url text not null default '',
  primary key (day, conversation_id)
);
create index conversations_page_day on conversations (page_id, day);
create index conversations_conv_day on conversations (conversation_id, day);

create table conv_tag_seen (
  conversation_id text not null,
  tag text not null,
  first_day date,
  baseline boolean not null,
  primary key (conversation_id, tag)
);

create table uploads (
  id bigint generated always as identity primary key,
  uploaded_at timestamptz not null default now(),
  kind text not null check (kind in ('tagStats', 'messages')),
  file_name text not null,
  day_from date,
  day_to date,
  page_ids text[] not null default '{}',
  rows int not null default 0
);

create table settings (
  key text primary key,
  value text not null
);

alter table tag_daily enable row level security;
alter table tag_groups enable row level security;
alter table conversations enable row level security;
alter table conv_tag_seen enable row level security;
alter table uploads enable row level security;
alter table settings enable row level security;

create policy "public read" on tag_daily for select to anon, authenticated using (true);
create policy "public read" on tag_groups for select to anon, authenticated using (true);
create policy "public read" on conversations for select to anon, authenticated using (true);
create policy "public read" on conv_tag_seen for select to anon, authenticated using (true);
create policy "public read" on uploads for select to anon, authenticated using (true);

-- per-tag totals for the tag screen, so the browser does not download every daily row
create view tag_totals with (security_invoker = true) as
  select tag, max(color) as color, sum(count)::int as total from tag_daily group by tag;
grant select on tag_totals to anon, authenticated;

revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
revoke all on settings from anon, authenticated;

create function assert_code(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  select value into v from settings where key = 'upload_code';
  if v is null or p_code is null or extensions.crypt(p_code, v) <> v then
    perform pg_sleep(1); -- slows down guessing
    raise exception 'รหัสอัปโหลดไม่ถูกต้อง';
  end if;
end $$;

create function check_code(p_code text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform assert_code(p_code);
  return true;
exception when raise_exception then
  return false;
end $$;

-- one transaction: replace every (day, page) in the file, then log the upload
create function save_tag_stats(p_code text, p_file text, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform assert_code(p_code);
  delete from tag_daily t
  using (select distinct (r->>'day')::date as day, r->>'page_id' as page_id from jsonb_array_elements(p_rows) r) k
  where t.day = k.day and t.page_id = k.page_id;

  insert into tag_daily (day, page_id, tag, color, count)
  select day, page_id, tag, coalesce(max(color), ''), coalesce(sum(count), 0)
  from jsonb_to_recordset(p_rows) as x(day date, page_id text, tag text, color text, count int)
  group by day, page_id, tag;
  get diagnostics n = row_count;

  insert into uploads (kind, file_name, day_from, day_to, page_ids, rows)
  select 'tagStats', p_file, min((r->>'day')::date), max((r->>'day')::date),
         array(select distinct r2->>'page_id' from jsonb_array_elements(p_rows) r2), n
  from jsonb_array_elements(p_rows) r;
  return n;
end $$;

create function save_messages(p_code text, p_file text, p_convs jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform assert_code(p_code);

  drop table if exists pg_temp.incoming;
  create temp table incoming on commit drop as
  select x.day, x.conversation_id, x.page_id, x.first_at, x.last_at, x.msg_count, x.first_kind, x.has_phone,
         array(select jsonb_array_elements_text(x.tags)) as tags, coalesce(x.pancake_url, '') as pancake_url
  from jsonb_to_recordset(p_convs) as x(day date, conversation_id text, page_id text, first_at timestamptz,
       last_at timestamptz, msg_count int, first_kind text, has_phone boolean, tags jsonb, pancake_url text);

  delete from conversations c
  using (select distinct day, page_id from incoming) k
  where c.day = k.day and c.page_id = k.page_id;

  insert into conversations (day, conversation_id, page_id, first_at, last_at, msg_count, first_kind, has_phone, tags, pancake_url)
  select day, conversation_id, page_id, first_at, last_at, msg_count, first_kind, has_phone, tags, pancake_url
  from incoming
  on conflict (day, conversation_id) do update set
    page_id = excluded.page_id, first_at = excluded.first_at, last_at = excluded.last_at, msg_count = excluded.msg_count,
    first_kind = excluded.first_kind, has_phone = excluded.has_phone, tags = excluded.tags, pancake_url = excluded.pancake_url;
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

create function set_tag_group(p_code text, p_tag text, p_grp text, p_ad_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_code(p_code);
  insert into tag_groups (tag, grp, ad_name, updated_at)
  values (p_tag, nullif(p_grp, ''), nullif(p_ad_name, ''), now())
  on conflict (tag) do update set grp = excluded.grp, ad_name = excluded.ad_name, updated_at = now();
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function check_code(text), save_tag_stats(text, text, jsonb), save_messages(text, text, jsonb),
  set_tag_group(text, text, text, text) to anon, authenticated;
