// Runs 0005 + 0006 + 0008 in PGlite with stand-ins for the 0001 tables they read, then checks how a silent chat
// from the follow list enters the queue when someone records a result for it (fu_start_chat).
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

const TEAM = '00000000-0000-0000-0000-00000000000a'
const STRANGER = '00000000-0000-0000-0000-00000000000d'
const FB = '100379779472465'

let pg: PGlite
let KOY: string, NOON: string, GM: string

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
  await pg.exec(readFileSync('supabase/migrations/0008_followup_start_chat.sql', 'utf8'))
  await pg.exec(`insert into auth.users values ('${TEAM}'), ('${STRANGER}'); insert into fu_team values ('${TEAM}');`)
  const ids = Object.fromEntries((await q<{ id: string; name: string }>('select id, name from staff')).map(r => [r.name, r.id]))
  KOY = ids['พี่ก้อย']; NOON = ids['นุ่น']; GM = ids['GM']
}, 60_000)

beforeEach(async () => {
  await pg.exec(`delete from fu_leads; delete from fu_sync_ignored; delete from conversations; delete from conv_tag_seen;
    delete from tag_groups; update staff set active = true;`)
})

const start = (actor: string, conv: string, result: string, note = '', order = '', user: string | null = TEAM) =>
  as<{ id: string }>(user, `select fu_start_chat($1, $2, $3, $4, $5) as id`, [actor, conv, result, note, order]).then(r => r[0].id)
const rounds = async (lead: string) => (await events(lead)).filter(e => e.kind === 'round' || e.kind === 'skip')

describe('start following a silent chat', () => {
  it('adds the chat like the sync does, with day 1 = its first file day, and records the result as the next round', async () => {
    await chat('c1234', day(-3), ['ขอราคา', 'มะกอก'])
    await chat('c1234', day(0), ['2.ขอราคา', 'มะกอก', 'อ่านไม่ตอบ'])
    const id = await start(KOY, 'c1234', 'waiting', 'ส่งราคาแล้ว')
    const [l] = await leads()
    expect(l).toMatchObject({
      id, name: 'Hylme (Facebook) · มะกอก · #1234', product: 'มะกอก', first_day: day(-3), source: 'chat',
      conversation_id: 'c1234', chat_url: 'https://pancake.vn/x/c1234', owner_id: KOY, status: 'active',
    })
    const evs = await events(id)
    expect(evs[0]).toMatchObject({ kind: 'create', note: 'เริ่มติดตามจากแชทเงียบ', by: KOY })
    // day 1 = day(-3): round 1 (day 2) was due yesterday → skipped by the system; round 2 (day 5) is the one recorded
    expect(await rounds(id)).toEqual([
      expect.objectContaining({ kind: 'skip', round_no: 1, note: 'เข้าระบบทีหลัง', by: null }),
      expect.objectContaining({ kind: 'round', round_no: 2, result: 'waiting', note: 'ส่งราคาแล้ว', by: KOY }),
    ])
  })

  it('won closes the customer and links the order; optout stops it', async () => {
    await chat('w1', day(0), ['2.ขอราคา'])
    await chat('o1', day(0), ['2.ขอราคา'])
    const w = await start(NOON, 'w1', 'won', '', 'A100')
    const o = await start(NOON, 'o1', 'optout')
    const byId = Object.fromEntries((await leads()).map(l => [l.id, l]))
    expect(byId[w].status).toBe('won')
    expect(byId[o].status).toBe('optout')
    expect(await q(`select order_id, lead_id from fu_orders`)).toEqual([{ order_id: 'A100', lead_id: w }])
  })

  it('refuses a chat already in the queue, a chat with no file, and an unknown result', async () => {
    await chat('d1', day(0), ['ติดตาม', '2.ขอราคา'])
    await sync()
    await expect(start(KOY, 'd1', 'sent')).rejects.toThrow('อยู่ในคิวติดตามแล้ว')
    await expect(start(KOY, 'nope', 'sent')).rejects.toThrow('ไม่พบแชทนี้')
    await chat('d2', day(0), ['2.ขอราคา'])
    await expect(start(KOY, 'd2', 'maybe')).rejects.toThrow('เลือกผลการติดตาม')
    expect(await leads()).toHaveLength(1)
  })

  it('a chat deleted from the queue before can be started again by hand', async () => {
    await chat('g1', day(0), ['2.ขอราคา'])
    await pg.exec(`insert into fu_sync_ignored (conversation_id) values ('g1')`)
    await start(KOY, 'g1', 'sent')
    expect(await q(`select * from fu_sync_ignored`)).toEqual([])
  })

  it('the GM pressing it gives the customer to an admin: name tag first, else fewer active customers', async () => {
    await chat('m1', day(0), ['2.ขอราคา', 'นุ่น🤍'])
    expect((await leads())).toHaveLength(0)
    await start(GM, 'm1', 'sent')
    await chat('m2', day(0), ['2.ขอราคา'])
    await start(GM, 'm2', 'sent')
    const owners = Object.fromEntries((await leads()).map(l => [l.conversation_id, l.owner_id]))
    expect(owners).toEqual({ m1: NOON, m2: KOY })
  })

  it('a chat first seen over 59 days ago still has round 7 open', async () => {
    await chat('old1', day(-80), ['2.ขอราคา'])
    const id = await start(KOY, 'old1', 'sent')
    expect((await leads())[0].first_day).toBe(day(-59))
    const rs = await rounds(id)
    expect(rs.filter(e => e.kind === 'skip').map(e => e.round_no)).toEqual([1, 2, 3, 4, 5, 6])
    expect(rs.at(-1)).toMatchObject({ kind: 'round', round_no: 7 })
  })

  it('is refused for someone not on the team or signed out', async () => {
    await chat('s1', day(0), ['2.ขอราคา'])
    await expect(start(KOY, 's1', 'sent', '', '', STRANGER)).rejects.toThrow('ยังไม่ได้รับสิทธิ์')
    await expect(start(KOY, 's1', 'sent', '', '', null)).rejects.toThrow()
  })
})
