-- Customer follow-up (7 rounds in 60 days). Unlike the rest of this database these tables hold customer
-- names, chat links and notes, so nothing here is readable by anon: every read needs a signed-in staff
-- member (admins see their own customers, the GM sees all) and every write goes through an RPC below
-- that checks the role, the owner, the record version and the round order.

create table staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null unique check (length(trim(name)) between 1 and 40),
  role text not null check (role in ('admin', 'gm')),
  active boolean not null default true
);

create table fu_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  product text not null check (length(trim(product)) between 1 and 80),
  owner_id uuid not null references staff (user_id),
  first_day date not null,
  page_id text check (page_id is null or page_id in ('100379779472465', '516356078238016', '923678677500634', 'igo_17841457670184062')),
  chat_url text not null default '' check (length(chat_url) <= 350),
  objection text not null default '' check (length(objection) <= 80),
  notes text not null default '' check (length(notes) <= 1000),
  status text not null default 'active' check (status in ('active', 'won', 'optout', 'paused')),
  version int not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references staff (user_id),
  updated_at timestamptz not null default now(),
  updated_by uuid references staff (user_id)
);
create unique index fu_leads_chat_url on fu_leads (chat_url) where chat_url <> '';
create index fu_leads_owner on fu_leads (owner_id);

-- append-only history: nothing updates or deletes a row except deleting the whole customer
create table fu_events (
  id bigint generated always as identity primary key,
  lead_id uuid not null references fu_leads (id) on delete cascade,
  kind text not null check (kind in ('create', 'edit', 'round', 'skip', 'status', 'reassign', 'order', 'import')),
  round_no int check (round_no between 1 and 7),
  result text,
  due_day date,
  note text not null default '' check (length(note) <= 1000),
  order_id text,
  at timestamptz not null default now(),
  by uuid references staff (user_id)
);
create index fu_events_lead on fu_events (lead_id, id);
-- a round is recorded or skipped once
create unique index fu_events_round_once on fu_events (lead_id, round_no) where kind in ('round', 'skip');

-- one Pancake order belongs to one customer; amount, items and cancellation come from pancake_orders
create table fu_orders (
  order_id text primary key check (length(order_id) between 1 and 40),
  lead_id uuid not null references fu_leads (id) on delete cascade,
  linked_at timestamptz not null default now(),
  linked_by uuid references staff (user_id)
);
create index fu_orders_lead on fu_orders (lead_id);

alter table staff enable row level security;
alter table fu_leads enable row level security;
alter table fu_events enable row level security;
alter table fu_orders enable row level security;
revoke all on staff, fu_leads, fu_events, fu_orders from anon, authenticated;
grant select on staff, fu_leads, fu_events, fu_orders to authenticated;

create function fu_role() returns text
language sql stable security definer set search_path = public as $$
  select role from staff where user_id = auth.uid() and active
$$;

create function fu_can_see(p_lead uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from fu_leads l join staff s on s.user_id = auth.uid() and s.active
    where l.id = p_lead and (s.role = 'gm' or l.owner_id = s.user_id))
$$;

create policy "staff read staff" on staff for select to authenticated using (fu_role() is not null);
create policy "own or gm" on fu_leads for select to authenticated
  using (fu_role() = 'gm' or (fu_role() = 'admin' and owner_id = auth.uid()));
create policy "own or gm" on fu_events for select to authenticated using (fu_can_see(lead_id));
create policy "own or gm" on fu_orders for select to authenticated using (fu_can_see(lead_id));

create function fu_bkk_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Bangkok')::date $$;

-- the signed-in staff member, or an error a person can act on
create function fu_me() returns staff
language plpgsql stable security definer set search_path = public as $$
declare me staff;
begin
  if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบก่อน'; end if;
  select * into me from staff where user_id = auth.uid() and active;
  if not found then raise exception 'บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้ระบบติดตาม ติดต่อเจ้าของระบบ'; end if;
  return me;
end $$;

-- lock the customer row; refuse when someone saved it since the caller loaded it
create function fu_lock(p_me staff, p_lead uuid, p_version int) returns fu_leads
language plpgsql security definer set search_path = public as $$
declare l fu_leads;
begin
  select * into l from fu_leads where id = p_lead for update;
  if not found or (p_me.role <> 'gm' and l.owner_id <> p_me.user_id) then
    raise exception 'ไม่พบลูกค้ารายนี้ หรือคุณไม่มีสิทธิ์แก้ไข';
  end if;
  if p_version is distinct from l.version then
    raise exception 'มีคนบันทึกข้อมูลลูกค้ารายนี้ไปก่อนแล้ว กดโหลดใหม่แล้วลองอีกครั้ง';
  end if;
  return l;
end $$;

create function fu_next_round(p_lead uuid) returns int
language sql stable security definer set search_path = public as $$
  select min(r) from generate_series(1, 7) r
  where not exists (select 1 from fu_events e where e.lead_id = p_lead and e.kind in ('round', 'skip') and e.round_no = r)
$$;

create function fu_due_day(p_first date, p_round int) returns date
language sql immutable as $$ select p_first + ((array[2, 5, 7, 14, 30, 45, 60])[p_round] - 1) $$;

create function fu_touch(p_lead uuid, p_me staff) returns int
language sql security definer set search_path = public as $$
  update fu_leads set version = version + 1, updated_at = now(), updated_by = p_me.user_id where id = p_lead returning version
$$;

create function fu_attach_order(p_me staff, p_lead uuid, p_order text) returns void
language plpgsql security definer set search_path = public as $$
declare v text := trim(coalesce(p_order, '')); other uuid;
begin
  if v = '' then return; end if;
  if length(v) > 40 then raise exception 'เลขออเดอร์ยาวเกินไป'; end if;
  select lead_id into other from fu_orders where order_id = v;
  if other = p_lead then return; end if;
  if other is not null then raise exception 'ออเดอร์ % ผูกกับลูกค้ารายอื่นแล้ว', v; end if;
  insert into fu_orders (order_id, lead_id, linked_by) values (v, p_lead, p_me.user_id);
  insert into fu_events (lead_id, kind, order_id, note, by) values (p_lead, 'order', v, 'ผูกออเดอร์', p_me.user_id);
end $$;

-- create (p_id null) or edit a customer; returns the id
create function fu_save_lead(p_id uuid, p_version int, p_name text, p_product text, p_owner uuid, p_first_day date,
  p_page text, p_chat_url text, p_objection text, p_notes text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me staff := fu_me();
  l fu_leads;
  v_url text := trim(coalesce(p_chat_url, ''));
  v_owner uuid := coalesce(p_owner, me.user_id);
  dup text;
  changed text[] := '{}';
begin
  if length(trim(coalesce(p_name, ''))) = 0 or length(trim(coalesce(p_product, ''))) = 0 or p_first_day is null then
    raise exception 'กรอกชื่อหรือรหัสลูกค้า สินค้า และวันที่คุยครั้งแรกให้ครบ';
  end if;
  if p_first_day > fu_bkk_today() then raise exception 'วันที่คุยครั้งแรกต้องไม่เกินวันนี้'; end if;
  if v_url <> '' and v_url !~* '^https?://' then raise exception 'ลิงก์แชตต้องขึ้นต้นด้วย https:// หรือ http://'; end if;
  -- an admin's edit keeps the current owner (set below), so this only applies to a new customer
  if p_id is null and me.role <> 'gm' and v_owner <> me.user_id then raise exception 'แอดมินเพิ่มลูกค้าได้เฉพาะของตัวเอง'; end if;
  if not exists (select 1 from staff where user_id = v_owner and active) then raise exception 'ไม่พบผู้ดูแลที่เลือก'; end if;
  if v_url <> '' then
    select s.name into dup from fu_leads x join staff s on s.user_id = x.owner_id
    where x.chat_url = v_url and x.id is distinct from p_id;
    if dup is not null then raise exception 'ลิงก์แชตนี้มีในระบบแล้ว (ผู้ดูแล: %)', dup; end if;
  end if;

  if p_id is null then
    insert into fu_leads (name, product, owner_id, first_day, page_id, chat_url, objection, notes, created_by, updated_by)
    values (trim(p_name), trim(p_product), v_owner, p_first_day, nullif(p_page, ''), v_url, coalesce(p_objection, ''),
            trim(coalesce(p_notes, '')), me.user_id, me.user_id)
    returning * into l;
    insert into fu_events (lead_id, kind, note, by) values (l.id, 'create', 'เพิ่มลูกค้า', me.user_id);
    return l.id;
  end if;

  l := fu_lock(me, p_id, p_version);
  if p_first_day <> l.first_day and exists (select 1 from fu_events where lead_id = l.id and kind in ('round', 'skip')) then
    raise exception 'แก้วันที่คุยครั้งแรกไม่ได้ เพราะบันทึกรอบติดตามไปแล้ว';
  end if;
  if me.role <> 'gm' then v_owner := l.owner_id; end if;
  if trim(p_name) <> l.name then changed := array_append(changed, 'ชื่อ'::text); end if;
  if trim(p_product) <> l.product then changed := array_append(changed, 'สินค้า'::text); end if;
  if p_first_day <> l.first_day then changed := array_append(changed, 'วันที่คุยครั้งแรก'::text); end if;
  if nullif(p_page, '') is distinct from l.page_id then changed := array_append(changed, 'เพจ'::text); end if;
  if v_url <> l.chat_url then changed := array_append(changed, 'ลิงก์แชต'::text); end if;
  if coalesce(p_objection, '') <> l.objection then changed := array_append(changed, 'เหตุผลที่ยังไม่ซื้อ'::text); end if;
  if trim(coalesce(p_notes, '')) <> l.notes then changed := array_append(changed, 'บันทึก'::text); end if;

  update fu_leads set name = trim(p_name), product = trim(p_product), owner_id = v_owner, first_day = p_first_day,
    page_id = nullif(p_page, ''), chat_url = v_url, objection = coalesce(p_objection, ''), notes = trim(coalesce(p_notes, ''))
  where id = l.id;
  if v_owner <> l.owner_id then
    insert into fu_events (lead_id, kind, note, by)
    values (l.id, 'reassign', (select name from staff where user_id = l.owner_id) || ' → ' || (select name from staff where user_id = v_owner), me.user_id);
  end if;
  if cardinality(changed) > 0 then
    insert into fu_events (lead_id, kind, note, by) values (l.id, 'edit', 'แก้ไข: ' || array_to_string(changed, ', '), me.user_id);
  end if;
  perform fu_touch(l.id, me);
  return l.id;
end $$;

-- other customers with the same name, so the form can warn before a duplicate is saved
create function fu_same_name(p_name text, p_exclude uuid) returns table (owner_name text, status text, first_day date)
language plpgsql stable security definer set search_path = public as $$
begin
  perform fu_me();
  return query
    select s.name, l.status, l.first_day from fu_leads l join staff s on s.user_id = l.owner_id
    where lower(trim(l.name)) = lower(trim(p_name)) and l.id is distinct from p_exclude
    order by l.first_day desc limit 5;
end $$;

create function fu_record_round(p_lead uuid, p_version int, p_round int, p_result text, p_note text, p_order text) returns int
language plpgsql security definer set search_path = public as $$
declare me staff := fu_me(); l fu_leads;
begin
  l := fu_lock(me, p_lead, p_version);
  if l.status <> 'active' then raise exception 'ลูกค้ารายนี้ไม่ได้อยู่ระหว่างติดตาม'; end if;
  if p_round is distinct from fu_next_round(l.id) then raise exception 'ต้องบันทึกตามลำดับรอบ (รอบถัดไปคือรอบ %)', fu_next_round(l.id); end if;
  if coalesce(p_result, '') not in ('sent', 'waiting', 'won', 'optout') then raise exception 'เลือกผลการติดตาม'; end if;
  insert into fu_events (lead_id, kind, round_no, result, due_day, note, order_id, by)
  values (l.id, 'round', p_round, p_result, fu_due_day(l.first_day, p_round), trim(coalesce(p_note, '')),
          nullif(trim(coalesce(p_order, '')), ''), me.user_id);
  if p_result = 'won' then
    update fu_leads set status = 'won' where id = l.id;
    perform fu_attach_order(me, l.id, p_order);
  elsif p_result = 'optout' then
    update fu_leads set status = 'optout' where id = l.id;
  end if;
  return fu_touch(l.id, me);
end $$;

create function fu_skip_round(p_lead uuid, p_version int, p_round int, p_reason text) returns int
language plpgsql security definer set search_path = public as $$
declare me staff := fu_me(); l fu_leads;
begin
  l := fu_lock(me, p_lead, p_version);
  if l.status <> 'active' then raise exception 'ลูกค้ารายนี้ไม่ได้อยู่ระหว่างติดตาม'; end if;
  if p_round is distinct from fu_next_round(l.id) then raise exception 'ข้ามได้เฉพาะรอบถัดไป (รอบ %)', fu_next_round(l.id); end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'ระบุเหตุผลที่ข้ามรอบ'; end if;
  insert into fu_events (lead_id, kind, round_no, due_day, note, by)
  values (l.id, 'skip', p_round, fu_due_day(l.first_day, p_round), trim(p_reason), me.user_id);
  return fu_touch(l.id, me);
end $$;

-- status change outside a round: bought between rounds, asked to stop, pause, resume
create function fu_set_status(p_lead uuid, p_version int, p_status text, p_note text, p_order text) returns int
language plpgsql security definer set search_path = public as $$
declare me staff := fu_me(); l fu_leads;
begin
  l := fu_lock(me, p_lead, p_version);
  if coalesce(p_status, '') not in ('active', 'won', 'optout', 'paused') then raise exception 'สถานะไม่ถูกต้อง'; end if;
  if p_status = l.status then raise exception 'สถานะนี้ถูกตั้งไว้แล้ว'; end if;
  -- reopening a customer who bought or asked to stop is a correction only the GM makes
  if p_status = 'active' and l.status in ('won', 'optout') and me.role <> 'gm' then
    raise exception 'เปิดติดตามลูกค้าที่ซื้อแล้วหรือขอหยุดติดต่อได้เฉพาะ GM';
  end if;
  update fu_leads set status = p_status where id = l.id;
  insert into fu_events (lead_id, kind, result, note, order_id, by)
  values (l.id, 'status', p_status, trim(coalesce(p_note, '')), nullif(trim(coalesce(p_order, '')), ''), me.user_id);
  if p_status = 'won' then perform fu_attach_order(me, l.id, p_order); end if;
  return fu_touch(l.id, me);
end $$;

create function fu_link_order(p_lead uuid, p_order text) returns void
language plpgsql security definer set search_path = public as $$
declare me staff := fu_me(); l fu_leads;
begin
  select * into l from fu_leads where id = p_lead for update;
  if not found or (me.role <> 'gm' and l.owner_id <> me.user_id) then raise exception 'ไม่พบลูกค้ารายนี้ หรือคุณไม่มีสิทธิ์แก้ไข'; end if;
  if l.status <> 'won' then raise exception 'ผูกออเดอร์ได้เมื่อสถานะเป็นซื้อแล้ว'; end if;
  if length(trim(coalesce(p_order, ''))) = 0 then raise exception 'ใส่เลขออเดอร์'; end if;
  perform fu_attach_order(me, l.id, p_order);
end $$;

create function fu_unlink_order(p_order text) returns void
language plpgsql security definer set search_path = public as $$
declare me staff := fu_me(); k fu_orders;
begin
  select * into k from fu_orders where order_id = trim(p_order);
  if not found or not exists (select 1 from fu_leads where id = k.lead_id and (me.role = 'gm' or owner_id = me.user_id)) then
    raise exception 'ไม่พบออเดอร์นี้ หรือคุณไม่มีสิทธิ์แก้ไข';
  end if;
  delete from fu_orders where order_id = k.order_id;
  insert into fu_events (lead_id, kind, order_id, note, by) values (k.lead_id, 'order', k.order_id, 'ยกเลิกการผูกออเดอร์', me.user_id);
end $$;

create function fu_delete_lead(p_lead uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me staff := fu_me();
begin
  if me.role <> 'gm' then raise exception 'ลบลูกค้าได้เฉพาะ GM'; end if;
  delete from fu_leads where id = p_lead;
end $$;

-- GM imports a CSV exported from the old single-file app; rows whose chat link already exists are skipped
create function fu_import(p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare me staff := fu_me(); r jsonb; h jsonb; new_id uuid; n int := 0;
begin
  if me.role <> 'gm' then raise exception 'นำเข้าข้อมูลได้เฉพาะ GM'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    if coalesce(r->>'chat_url', '') <> '' and exists (select 1 from fu_leads where chat_url = r->>'chat_url') then continue; end if;
    if not exists (select 1 from staff where user_id = (r->>'owner_id')::uuid and active) then raise exception 'ไม่พบผู้ดูแลของแถว %', r->>'name'; end if;
    insert into fu_leads (name, product, owner_id, first_day, page_id, chat_url, objection, notes, status, created_by, updated_by)
    values (r->>'name', r->>'product', (r->>'owner_id')::uuid, (r->>'first_day')::date, nullif(r->>'page_id', ''),
            coalesce(r->>'chat_url', ''), left(coalesce(r->>'objection', ''), 80), coalesce(r->>'notes', ''),
            coalesce(r->>'status', 'active'), me.user_id, me.user_id)
    returning id into new_id;
    insert into fu_events (lead_id, kind, note, by) values (new_id, 'import', 'นำเข้าจากเว็บแอปเดิม', me.user_id);
    for h in select * from jsonb_array_elements(coalesce(r->'history', '[]')) loop
      insert into fu_events (lead_id, kind, round_no, result, due_day, note, at, by)
      values (new_id, 'round', (h->>'round')::int, 'legacy', fu_due_day((r->>'first_day')::date, (h->>'round')::int),
              coalesce(h->>'note', ''), ((h->>'day') || ' 12:00')::timestamp at time zone 'Asia/Bangkok', me.user_id)
      on conflict do nothing;
    end loop;
    n := n + 1;
  end loop;
  return n;
end $$;

-- only the functions created here; functions from earlier migrations and other apps keep their grants
revoke execute on function fu_role(), fu_can_see(uuid), fu_bkk_today(), fu_me(), fu_lock(staff, uuid, int), fu_next_round(uuid),
  fu_due_day(date, int), fu_touch(uuid, staff), fu_attach_order(staff, uuid, text),
  fu_save_lead(uuid, int, text, text, uuid, date, text, text, text, text), fu_same_name(text, uuid),
  fu_record_round(uuid, int, int, text, text, text), fu_skip_round(uuid, int, int, text), fu_set_status(uuid, int, text, text, text),
  fu_link_order(uuid, text), fu_unlink_order(text), fu_delete_lead(uuid), fu_import(jsonb)
  from public, anon, authenticated;
-- fu_role and fu_can_see run inside the read policies, so signed-in users need them
grant execute on function fu_role(), fu_can_see(uuid), fu_save_lead(uuid, int, text, text, uuid, date, text, text, text, text),
  fu_same_name(text, uuid), fu_record_round(uuid, int, int, text, text, text), fu_skip_round(uuid, int, int, text),
  fu_set_status(uuid, int, text, text, text), fu_link_order(uuid, text), fu_unlink_order(text), fu_delete_lead(uuid),
  fu_import(jsonb) to authenticated;
