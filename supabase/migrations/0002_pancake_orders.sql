-- Daily Pancake order exports: one row per order, no customer name, phone or address.

create table pancake_orders (
  order_id text primary key,
  day date not null,
  confirmed_at timestamptz not null,
  admin text not null default '',
  source text not null default '',
  page_id text,
  amount numeric not null default 0,
  discount numeric not null default 0,
  cod boolean not null default false,
  status text not null default '',
  items jsonb not null default '[]'
);
create index pancake_orders_day on pancake_orders (day);

alter table pancake_orders enable row level security;
create policy "public read" on pancake_orders for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on pancake_orders from anon, authenticated;

alter table uploads drop constraint if exists uploads_kind_check;
alter table uploads add constraint uploads_kind_check check (kind in ('tagStats', 'messages', 'orders'));

-- an order exported again (for example after a status change) replaces the saved copy
create function save_orders(p_code text, p_file text, p_orders jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform assert_code(p_code);

  insert into pancake_orders (order_id, day, confirmed_at, admin, source, page_id, amount, discount, cod, status, items)
  select x.order_id, x.day, x.confirmed_at, coalesce(x.admin, ''), coalesce(x.source, ''), nullif(x.page_id, ''),
         coalesce(x.amount, 0), coalesce(x.discount, 0), coalesce(x.cod, false), coalesce(x.status, ''), coalesce(x.items, '[]')
  from jsonb_to_recordset(p_orders) as x(order_id text, day date, confirmed_at timestamptz, admin text, source text,
       page_id text, amount numeric, discount numeric, cod boolean, status text, items jsonb)
  on conflict (order_id) do update set
    day = excluded.day, confirmed_at = excluded.confirmed_at, admin = excluded.admin, source = excluded.source,
    page_id = excluded.page_id, amount = excluded.amount, discount = excluded.discount, cod = excluded.cod,
    status = excluded.status, items = excluded.items;
  get diagnostics n = row_count;

  insert into uploads (kind, file_name, day_from, day_to, page_ids, rows)
  select 'orders', p_file, min((r->>'day')::date), max((r->>'day')::date),
         array(select distinct r2->>'page_id' from jsonb_array_elements(p_orders) r2 where coalesce(r2->>'page_id', '') <> ''), n
  from jsonb_array_elements(p_orders) r;
  return n;
end $$;

revoke execute on function save_orders(text, text, jsonb) from public, anon, authenticated;
grant execute on function save_orders(text, text, jsonb) to anon, authenticated;
