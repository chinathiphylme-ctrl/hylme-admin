-- Customer quotes that admins pick by hand for marketing. Only the sentence, never a name or full chat.
-- Phone numbers are masked here as well as in the browser.

create table customer_quotes (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  day date not null,
  page_id text not null,
  category text not null check (category in (
    'ราคา/แพง', 'ไม่มั่นใจ/ขอรีวิว', 'อาการ/สุขภาพ', 'กลัวผลข้างเคียง', 'ส่งของ/จ่ายเงิน', 'เทียบยี่ห้ออื่น', 'คำชม', 'อื่นๆ')),
  quote text not null check (length(quote) between 1 and 500),
  note text not null default '' check (length(note) <= 300)
);
create index customer_quotes_day on customer_quotes (day);

alter table customer_quotes enable row level security;
create policy "public read" on customer_quotes for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on customer_quotes from anon, authenticated;

create function mask_phones(p text) returns text
language sql immutable set search_path = public as $$
  select regexp_replace(p, '\+?[0-9]([[:space:]-]?[0-9]){8,}', '[เบอร์]', 'g')
$$;

create function add_quote(p_code text, p_day date, p_page text, p_category text, p_quote text, p_note text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  perform assert_code(p_code);
  insert into customer_quotes (day, page_id, category, quote, note)
  values (p_day, p_page, p_category, mask_phones(btrim(p_quote)), mask_phones(btrim(coalesce(p_note, ''))))
  returning id into v;
  return v;
end $$;

create function delete_quote(p_code text, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_code(p_code);
  delete from customer_quotes where id = p_id;
end $$;

revoke execute on function mask_phones(text), add_quote(text, date, text, text, text, text), delete_quote(text, bigint)
  from public, anon, authenticated;
grant execute on function add_quote(text, date, text, text, text, text), delete_quote(text, bigint) to anon, authenticated;
