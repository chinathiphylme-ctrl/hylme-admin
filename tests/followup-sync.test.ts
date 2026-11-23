// Runs 0005 + 0006 in PGlite with stand-ins for the 0001 tables they read, then checks how chats tagged
// ติดตาม in Pancake enter the follow-up queue.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

const TEAM = '00000000-0000-0000-0000-00000000000a'
const STRANGER = '00000000-0000-0000-0000-00000000000d'
const FB = '100379779472465'

let pg: PGlite
let KOY: string, NOON: string

const SUPABASE_STUB = `
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`

// the parts of 0001_init.sql (+ 0004 topics) that the sync reads
const BASE_STUB = `
  create table conversations (
    day date not null, conversation_id text not null, page_id text not null, first_at timestamptz not null,
    last_at timestamptz not null, msg_count int not null, first_kind text not null, has_phone boolean not null default false,
    tags text[] not null default '{}', pancake_url text not null default '', topics text[] not null default '{}',
    primary key (day, conversation_id));
  create table conv_tag_seen (conversation_id text not null, tag text not null, first_day date, baseline boolean not null,
    primary key (conversation_id, tag));
  create table tag_groups (tag text primary key, grp text not null, ad_name text, updated_at timestamptz not null default now());
  create function assert_code(p_code text) returns void language plpgsql security definer set search_path = public as $$
  begin if p_code is distinct from 'ok' then raise exception 'รหัสอัปโหลดไม่ถูกต้อง'; end if; end $$;
`

async function as<T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return pg.transaction(async tx => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user ?? ''])
    await tx.exec(`set local role ${user ? 'authenticated' : 'anon'}`)
    return (await tx.query<T>(sql, params)).rows
  })
}
const team = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as<T>(TEAM, sql, params)
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows

const day = (offset: number) => new Date(Date.now() + 7 * 3600e3 + offset * 864e5).toISOString().slice(0, 10)

type Counts = { added: number; linked: number; rounds: number; skipped: number; won: number }
const sync = async () => (await as<{ r: Counts }>(null, `select fu_sync_upload('ok') as r`))[0].r

// one day's export row for a chat; tags listed in `baseline` are seen with an unknown date
async function chat(id: string, d: string, tags: string[], o: { page?: string; url?: string; baseline?: string[] } = {}) {
  await pg.query(
    `insert into conversations (day, conversation_id, page_id, first_at, last_at, msg_count, first_kind, tags, pancake_url)
     values ($1, $2, $3, $4, $4, 1, 'typed', $5, $6)`,
    [d, id, o.page ?? FB, `${d}T10:00:00+07:00`, tags, o.url ?? `https://pancake.vn/x/${id}`])
  for (const t of tags) {
    const base = o.baseline?.includes(t) ?? false
    await pg.query(
      `insert into conv_tag_seen values ($1, $2, $3, $4) on conflict (conversation_id, tag) do update set
         baseline = conv_tag_seen.baseline or excluded.baseline,
         first_day = case when conv_tag_seen.baseline or excluded.baseline then null else least(conv_tag_seen.first_day, excluded.first_day) end`,
      [id, t, base ? null : d, base])
  }
}

type LeadRow = { id: string; name: string; product: string; owner_id: string; first_day: string; source: string; conversation_id: string | null; chat_url: string; status: string; version: number }
const leads = () => q<LeadRow>(`select id, name, product, owner_id, to_char(first_day, 'YYYY-MM-DD') first_day, source, conversation_id, chat_url, status, version from fu_leads order by created_at, name`)
const events = (lead: string) => q<{ kind: string; round_no: number | null; result: string | null; note: string; by: string | null; due_day: string | null; at_day: string }>(
  `select kind, round_no, result, note, by, to_char(due_day, 'YYYY-MM-DD') due_day, to_char(at at time zone 'Asia/Bangkok', 'YYYY-MM-DD') at_day
   from fu_events where lead_id = $1 order by id`, [lead])
const manual = async (actor: string, name: string, url: string, first = day(-3)) =>
  (await team<{ id: string }>(`select fu_save_lead($1, null, null, $2, 'GABA', $1, $3, $4, $5, '', '') as id`, [actor, name, first, FB, url]))[0].id

beforeAll(async () => {
  pg = new PGlite()
  await pg.exec(SUPABASE_STUB)
  await pg.exec(BASE_STUB)
  await pg.exec(readFileSync('supabase/migrations/0005_followup.sql', 'utf8'))
  await pg.exec(readFileSync('supabase/migrations/0006_followup_sync.sql', 'utf8'))
  await pg.exec(readFileSync('supabase/migrations/0009_followup_count_from_done.sql', 'utf8'))
  await pg.exec(`insert into auth.users values ('${TEAM}'), ('${STRANGER}'); insert into fu_team values ('${TEAM}');`)
  const ids = Object.fromEntries((await q<{ id: string; name: string }>('select id, name from staff')).map(r => [r.name, r.id]))
  KOY = ids['พี่ก้อย']; NOON = ids['นุ่น']
}, 60_000)

beforeEach(async () => {
  await pg.exec(`delete from fu_leads; delete from fu_sync_ignored; delete from conversations; delete from conv_tag_seen;
    delete from tag_groups; update staff set active = true;`)
})

describe('auto intake from the ติดตาม tag', () => {
  it('adds a chat tagged ติดตาม with page, product, link and day 1 = tag day', async () => {
    await chat('c1234', day(0), ['ติดตาม', 'มะกอก', 'พี่ก้อย'])
    expect(await sync()).toMatchObject({ added: 1 })
    const [l] = await leads()
    expect(l).toMatchObject({
      name: 'Hylme (Facebook) · มะกอก · #1234', product: 'มะกอก', first_day: day(0), source: 'tag',
      conversation_id: 'c1234', chat_url: 'https://pancake.vn/x/c1234', owner_id: KOY,
    })
    expect(await events(l.id)).toEqual([expect.objectContaining({ kind: 'auto', note: 'เข้าคิวอัตโนมัติจากแท็กติดตาม', by: null })])
  })

  it('no product tag gives ไม่ระบุ', async () => {
    await chat('abcd9876', day(0), ['ติดตาม'], { page: '923678677500634' })
    await sync()
    expect((await leads())[0]).toMatchObject({ name: 'ครบจบเรื่องนอน · ไม่ระบุ · #9876', product: 'ไม่ระบุ' })
  })

  it('tag_groups can add or remove a product tag', async () => {
    await pg.exec(`insert into tag_groups (tag, grp) values ('GABA', 'สินค้า'), ('Gluta', 'อื่นๆ')`)
    await chat('g1', day(0), ['ติดตาม', 'GABA'])
    await chat('g2', day(0), ['ติดตาม', 'Gluta'])
    await sync()
    const byConv = Object.fromEntries((await leads()).map(l => [l.conversation_id, l.product]))
    expect(byConv).toEqual({ g1: 'GABA', g2: 'ไม่ระบุ' })
  })

  it('ignores chats without a follow tag and tags like ติดตามลูกค้า', async () => {
    await chat('n1', day(0), ['มะกอก', 'พี่ก้อย'])
    await chat('n2', day(0), ['ติดตามลูกค้า'])
    expect(await sync()).toMatchObject({ added: 0 })
    expect(await leads()).toEqual([])
  })

  it('skips a chat already closed on or before the follow tag day', async () => {
    await chat('s1', day(0), ['ติดตาม', 'ปิด'])
    await chat('s2', day(0), ['ติดตาม', 'ปิดAds'], { baseline: ['ปิดAds'] })
    expect(await sync()).toMatchObject({ added: 0 })
  })

  it('owner is the admin whose tag appeared first', async () => {
    await chat('o1', day(-3), ['ติดตาม', 'นุ่น🤍'])
    await chat('o1', day(-1), ['ติดตาม', 'นุ่น🤍', 'พี่ก้อย'])
    await sync()
    expect((await leads())[0].owner_id).toBe(NOON)
  })

  it('no admin tag goes to the admin with fewer active customers', async () => {
    await manual(KOY, 'ก1', '')
    await manual(KOY, 'ก2', '')
    await chat('b1', day(0), ['ติดตาม'])
    await sync()
    expect((await leads()).find(l => l.conversation_id === 'b1')!.owner_id).toBe(NOON)
    // now 2 : 1 → นุ่น again, then 2 : 2 → first by name, never GM
    await chat('b2', day(0), ['ติดตาม'])
    await sync()
    await chat('b3', day(0), ['ติดตาม'])
    await sync()
    const owners = Object.fromEntries((await leads()).map(l => [l.conversation_id, l.owner_id]))
    expect(owners.b2).toBe(NOON)
    const [first] = (await q<{ id: string }>(`select id from staff where role = 'admin' order by name limit 1`))
    expect(owners.b3).toBe(first.id)
  })

  it('renamed or inactive admin falls back to balancing', async () => {
    await pg.query('update staff set active = false where id = $1', [KOY])
    await chat('r1', day(0), ['ติดตาม', 'พี่ก้อย'])
    await sync()
    expect((await leads())[0].owner_id).toBe(NOON)
  })

  it('running twice adds nothing the second time', async () => {
    await chat('t1', day(0), ['ติดตาม'])
    await sync()
    expect(await sync()).toMatchObject({ added: 0 })
    const all = await leads()
    expect(all).toHaveLength(1)
    expect((await events(all[0].id)).filter(e => e.kind === 'auto')).toHaveLength(1)
  })

  it('links a manual customer with the same chat link instead of adding', async () => {
    const id = await manual(KOY, 'พิมพ์เอง', 'https://pancake.vn/x/c9')
    await chat('c9', day(0), ['ติดตาม'])
    expect(await sync()).toMatchObject({ added: 0, linked: 1 })
    const all = await leads()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ id, conversation_id: 'c9', source: 'manual' })
  })

  it('two chat links of one chat on two manual customers link only one and never break the sync', async () => {
    await manual(KOY, 'ลิงก์เก่า', 'https://pancake.vn/old/cx')
    await manual(NOON, 'ลิงก์ใหม่', 'https://pancake.vn/new/cx')
    await chat('cx', day(-1), ['ติดตาม'], { url: 'https://pancake.vn/old/cx' })
    await chat('cx', day(0), ['ติดตาม'], { url: 'https://pancake.vn/new/cx' })
    expect(await sync()).toMatchObject({ added: 0, linked: 1 })
    expect((await leads()).filter(l => l.conversation_id === 'cx')).toHaveLength(1)
    expect(await sync()).toMatchObject({ added: 0, linked: 0 })
  })

  it('a chat link that is not http(s) is not copied', async () => {
    await chat('u1', day(0), ['ติดตาม'], { url: 'javascript:alert(1)' })
    await sync()
    expect((await leads())[0].chat_url).toBe('')
  })

  it('trims spaces around product tags', async () => {
    await chat('sp1', day(0), ['ติดตาม', ' มะกอก '])
    await sync()
    expect((await leads())[0].product).toBe('มะกอก')
  })

  it('entry points check who calls', async () => {
    await expect(as(null, `select fu_sync_upload('bad')`)).rejects.toThrow('รหัสอัปโหลดไม่ถูกต้อง')
    await expect(as(null, 'select fu_sync_core()')).rejects.toThrow(/permission denied/)
    await expect(as(TEAM, 'select fu_sync_core()')).rejects.toThrow(/permission denied/)
    await expect(as(STRANGER, 'select fu_sync_team()')).rejects.toThrow('ยังไม่ได้รับสิทธิ์')
    await expect(as(null, 'select fu_sync_team()')).rejects.toThrow(/permission denied|กรุณาเข้าสู่ระบบ/)
    expect((await team<{ r: Counts }>('select fu_sync_team() as r'))[0].r).toMatchObject({ added: 0 })
  })
})

describe('later syncs read the tags', () => {
  const only = async (conv: string) => (await leads()).find(l => l.conversation_id === conv)!
  const setStatus = (id: string, v: number, status: string) =>
    team('select fu_set_status($1, $2, $3, $4, $5, $6)', [KOY, id, v, status, '', null])

  it('ติดตามN marks rounds 1..N done', async () => {
    await chat('r3', day(0), ['ติดตาม3'])
    expect(await sync()).toMatchObject({ added: 1, rounds: 3, skipped: 0 })
    const l = await only('r3')
    const due = await q<{ r: number; d: string }>(`select r, to_char(fu_due_day($1::date, r), 'YYYY-MM-DD') d from generate_series(1, 3) r`, [l.first_day])
    const rounds = (await events(l.id)).filter(e => e.kind === 'round')
    expect(rounds.map(e => [e.round_no, e.result, e.by, e.due_day, e.at_day])).toEqual(due.map(x => [x.r, 'tag', null, x.d, day(0)]))
  })

  it('a later ติดตามN fills only the empty rounds', async () => {
    await chat('f1', day(-1), ['ติดตาม'])
    await sync()
    const l = await only('f1')
    await team('select fu_record_round($1, $2, $3, 1, $4, $5, null)', [KOY, l.id, l.version, 'sent', 'ทักแล้ว'])
    await chat('f1', day(0), ['ติดตาม', 'ติดตาม2'])
    expect(await sync()).toMatchObject({ rounds: 1 })
    const rounds = (await events(l.id)).filter(e => e.kind === 'round')
    expect(rounds.map(e => [e.round_no, e.result, e.by])).toEqual([[1, 'sent', KOY], [2, 'tag', null]])
  })

  it('late entry skips nothing: the customer starts at round 1 (0009)', async () => {
    await chat('l1', day(-10), ['ติดตาม'])
    expect(await sync()).toMatchObject({ added: 1, skipped: 0 })
    const l = await only('l1')
    expect((await events(l.id)).filter(e => e.kind === 'skip')).toEqual([])
    expect((await q<{ d: string }>(`select to_char(fu_round_due($1, 1), 'YYYY-MM-DD') d`, [l.id]))[0].d).toBe(day(0))
    // a customer already in the queue whose round becomes overdue stays overdue
    await chat('l2', day(0), ['ติดตาม'])
    await sync()
    await pg.query(`update fu_leads set first_day = $1 where conversation_id = 'l2'`, [day(-5)])
    expect(await sync()).toMatchObject({ skipped: 0 })
    expect((await events((await only('l2')).id)).filter(e => e.kind === 'skip')).toEqual([])
  })

  it('close tag after intake marks bought', async () => {
    await chat('w1', day(-2), ['ติดตาม'])
    await sync()
    const before = await only('w1')
    await chat('w1', day(0), ['ติดตาม', 'ปิดAds'])
    expect(await sync()).toMatchObject({ won: 1 })
    const after = await only('w1')
    expect(after).toMatchObject({ status: 'won', version: before.version + 1 })
    const st = (await events(after.id)).filter(e => e.kind === 'status')
    expect(st).toEqual([expect.objectContaining({ result: 'won', note: 'จากแท็กปิดใน Pancake', by: null })])
    expect(await sync()).toMatchObject({ won: 0 })
    expect((await events(after.id)).filter(e => e.kind === 'status')).toHaveLength(1)
  })

  it('manual bought or stopped is left alone', async () => {
    await chat('m1', day(-2), ['ติดตาม'])
    await chat('m2', day(-2), ['ติดตาม'])
    await sync()
    const a = await only('m1'), b = await only('m2')
    await setStatus(a.id, a.version, 'won')
    await setStatus(b.id, b.version, 'optout')
    const va = (await only('m1')).version, vb = (await only('m2')).version
    await chat('m1', day(0), ['ติดตาม', 'ปิด'])
    await chat('m2', day(0), ['ติดตาม', 'ปิด'])
    expect(await sync()).toMatchObject({ won: 0 })
    expect([(await only('m1')).version, (await only('m2')).version]).toEqual([va, vb])
    expect((await only('m2')).status).toBe('optout')
  })

  it('later syncs never overwrite edits', async () => {
    await chat('e1', day(-1), ['ติดตาม', 'มะกอก', 'พี่ก้อย'])
    await sync()
    const l = await only('e1')
    await team(`select fu_save_lead($1, $2, $3, 'คุณเอ', 'Gluta', $4, $5, $6, $7, '', '')`, [KOY, l.id, l.version, NOON, l.first_day, FB, l.chat_url])
    await chat('e1', day(0), ['ติดตาม', 'ติดตาม2', 'Magnesium', 'พี่ก้อย'])
    await sync()
    expect(await only('e1')).toMatchObject({ name: 'คุณเอ', product: 'Gluta', owner_id: NOON, first_day: day(-1) })
  })

  it('deleted customers do not come back', async () => {
    await chat('d1', day(0), ['ติดตาม'])
    await sync()
    await team('select fu_delete_lead($1, $2)', [KOY, (await only('d1')).id])
    expect(await sync()).toMatchObject({ added: 0 })
    expect(await q('select conversation_id from fu_sync_ignored')).toEqual([{ conversation_id: 'd1' }])
    const m = await manual(KOY, 'ไม่มีแชท', '')
    await team('select fu_delete_lead($1, $2)', [KOY, m])
    expect(await q('select conversation_id from fu_sync_ignored')).toHaveLength(1)
  })

  it('ติดตามN above 7 counts as 7, and ติดตาม1 as round 1', async () => {
    await chat('n8', day(0), ['ติดตาม8'])
    await chat('n1', day(0), ['ติดตาม1'])
    await sync()
    const rounds = async (c: string) => (await events((await only(c)).id)).filter(e => e.kind === 'round').map(e => e.round_no)
    expect(await rounds('n8')).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(await rounds('n1')).toEqual([1])
  })

  it('a customer reopened after an automatic bought stays open', async () => {
    await chat('ro', day(-3), ['ติดตาม'])
    await sync()
    await chat('ro', day(-1), ['ติดตาม', 'ปิด'])
    await sync()
    const won = await only('ro')
    expect(won.status).toBe('won')
    await team('select fu_set_status($1, $2, $3, $4, $5, $6)', [KOY, won.id, won.version, 'active', 'ลูกค้าทักกลับมา', null])
    expect(await sync()).toMatchObject({ won: 0 })
    expect((await only('ro')).status).toBe('active')
  })

  it('an automatic bought is dated the day the close tag appeared', async () => {
    await chat('wd', day(-3), ['ติดตาม'])
    await sync()
    await chat('wd', day(-1), ['ติดตาม', 'ปิดAds'])
    await sync()
    const st = (await events((await only('wd')).id)).filter(e => e.kind === 'status')
    expect(st.map(e => e.at_day)).toEqual([day(-1)])
  })

  it('inactive leads get no tag rounds', async () => {
    await chat('p1', day(-1), ['ติดตาม'])
    await sync()
    await pg.query(`update fu_leads set status = 'paused' where conversation_id = 'p1'`)
    await chat('p1', day(0), ['ติดตาม', 'ติดตาม2'])
    expect(await sync()).toMatchObject({ rounds: 0 })
    expect((await events((await only('p1')).id)).filter(e => e.kind === 'round')).toEqual([])
  })
})
