-- Which chat each Pancake order came from, sent every hour by the order sync on the owner's computer
-- (data sec/tools/pancake_sync.mjs, from the Pancake POS API). Only order id, chat id, page id and confirm day:
-- no amount, items, status, customer name, phone or address. Order numbers and sales still come from pancake_orders.
-- Spec: docs/superpowers/specs/2026-11-28-order-chat-link-design.md

create table order_chats (
  order_id text primary key,
  conversation_id text not null,
  page_id text,
  day date not null,
  updated_at timestamptz not null default now()
);
create index order_chats_day on order_chats (day);
create index order_chats_conversation on order_chats (conversation_id);

alter table order_chats enable row level security;
create policy "public read" on order_chats for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on order_chats from anon, authenticated;

-- when the sync last sent pairs, so the card can say how fresh they are
create table order_chat_sync (
  id int primary key default 1 check (id = 1),
  at timestamptz not null,
  rows int not null
);
alter table order_chat_sync enable row level security;
create policy "public read" on order_chat_sync for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on order_chat_sync from anon, authenticated;

create function save_order_chats(p_code text, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
begin
  perform assert_code(p_code);

  insert into order_chats (order_id, conversation_id, page_id, day)
  select x.order_id, x.conversation_id, nullif(x.page_id, ''), x.day
  from jsonb_to_recordset(p_rows) as x(order_id text, conversation_id text, page_id text, day date)
  where coalesce(x.order_id, '') <> '' and coalesce(x.conversation_id, '') <> '' and x.day is not null
  on conflict (order_id) do update set
    conversation_id = excluded.conversation_id, page_id = excluded.page_id, day = excluded.day, updated_at = now()
  where (order_chats.conversation_id, order_chats.page_id, order_chats.day)
    is distinct from (excluded.conversation_id, excluded.page_id, excluded.day);

  insert into order_chat_sync (id, at, rows) values (1, now(), jsonb_array_length(p_rows))
  on conflict (id) do update set at = excluded.at, rows = excluded.rows;
  return jsonb_array_length(p_rows);
end $$;

revoke execute on function save_order_chats(text, jsonb) from public, anon, authenticated;
grant execute on function save_order_chats(text, jsonb) to anon, authenticated;
