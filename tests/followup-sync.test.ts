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
    await chat('n3', day(0), [' ติดตาม8'])
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

  it('entry points check who calls', async () => {
    await expect(as(null, `select fu_sync_upload('bad')`)).rejects.toThrow('รหัสอัปโหลดไม่ถูกต้อง')
    await expect(as(null, 'select fu_sync_core()')).rejects.toThrow(/permission denied/)
    await expect(as(TEAM, 'select fu_sync_core()')).rejects.toThrow(/permission denied/)
    await expect(as(STRANGER, 'select fu_sync_team()')).rejects.toThrow('ยังไม่ได้รับสิทธิ์')
    await expect(as(null, 'select fu_sync_team()')).rejects.toThrow(/permission denied|กรุณาเข้าสู่ระบบ/)
    expect((await team<{ r: Counts }>('select fu_sync_team() as r'))[0].r).toMatchObject({ added: 0 })
  })
})
