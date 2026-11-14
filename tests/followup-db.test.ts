// Runs supabase/migrations/0005_followup.sql in an in-process Postgres (PGlite) with a minimal stand-in for
// Supabase's auth schema and default grants, then checks the access rules for the shared team sign-in.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'

const TEAM = '00000000-0000-0000-0000-00000000000a' // the shared sign-in
const STRANGER = '00000000-0000-0000-0000-00000000000d' // signed in, but not on the team

let pg: PGlite
let KOY: string, NOON: string, GM: string

const SUPABASE_STUB = `
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  -- Supabase grants everything in public to the API roles by default; the migration must take it back
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`

async function as<T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return pg.transaction(async tx => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user ?? ''])
    await tx.exec(`set local role ${user ? 'authenticated' : 'anon'}`)
    const r = await tx.query<T>(sql, params)
    return r.rows
  })
}
const team = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as<T>(TEAM, sql, params)

const day = (offset: number) => {
  const d = new Date(Date.now() + 7 * 3600e3 + offset * 864e5)
  return d.toISOString().slice(0, 10)
}

const SAVE = `select fu_save_lead($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as id`
const newLead = async (actor: string, name: string, owner: string | null = null, url = '', first = day(-3), user = TEAM) =>
  (await as<{ id: string }>(user, SAVE, [actor, null, null, name, 'GABA', owner, first, '516356078238016', url, 'ราคา', '']))[0].id
const version = async (id: string) => (await pg.query<{ version: number }>('select version from fu_leads where id = $1', [id])).rows[0].version
const record = (actor: string, id: string, v: number, round: number, result: string, order: string | null = null) =>
  team('select fu_record_round($1, $2, $3, $4, $5, $6, $7) as v', [actor, id, v, round, result, 'โน้ต', order])

beforeAll(async () => {
  pg = new PGlite()
  await pg.exec(SUPABASE_STUB)
  await pg.exec(readFileSync('supabase/migrations/0005_followup.sql', 'utf8'))
  await pg.exec(`insert into auth.users values ('${TEAM}'), ('${STRANGER}'); insert into fu_team values ('${TEAM}');`)
  const ids = Object.fromEntries((await pg.query<{ id: string; name: string }>('select id, name from staff')).rows.map(r => [r.name, r.id]))
  KOY = ids['พี่ก้อย']; NOON = ids['นุ่น']; GM = ids['GM']
}, 60_000)

describe('follow-up database rules', () => {
  it('starts with the three people from the brief', async () => {
    expect(await team<{ name: string; role: string }>('select name, role from staff order by role, name'))
      .toEqual([{ name: 'นุ่น', role: 'admin' }, { name: 'พี่ก้อย', role: 'admin' }, { name: 'GM', role: 'gm' }])
  })

  it('keeps every customer row away from anon and from accounts not on the team', async () => {
    await newLead(KOY, 'ลับ')
    await expect(as(null, 'select * from fu_leads')).rejects.toThrow(/permission denied/)
    await expect(as(null, 'select * from staff')).rejects.toThrow(/permission denied/)
    expect(await as(STRANGER, 'select * from fu_leads')).toEqual([])
    expect(await as(STRANGER, 'select * from staff')).toEqual([])
    await expect(newLead(KOY, 'x', null, '', day(-3), STRANGER)).rejects.toThrow('ยังไม่ได้รับสิทธิ์')
    await expect(as(STRANGER, 'select fu_save_staff($1, null, $2, $3, true)', [KOY, 'แอบเพิ่ม', 'admin'])).rejects.toThrow('ยังไม่ได้รับสิทธิ์')
    await expect(team(`insert into fu_leads (name, product, owner_id, first_day) values ('x', 'y', '${KOY}', current_date)`))
      .rejects.toThrow(/permission denied/)
  })

  it('needs a picked name, and lets the team help with each other’s customers', async () => {
    await expect(newLead('00000000-0000-0000-0000-000000000099', 'ไม่มีชื่อ')).rejects.toThrow('เลือกชื่อของคุณก่อน')
    const id = await newLead(KOY, 'ของก้อย')
    await record(NOON, id, 1, 1, 'sent') // นุ่น records on พี่ก้อย's customer
    const ev = await team<{ kind: string; by: string }>('select kind, by from fu_events where lead_id = $1 order by id', [id])
    expect(ev).toEqual([{ kind: 'create', by: KOY }, { kind: 'round', by: NOON }])
    expect((await team<{ owner_id: string }>('select owner_id from fu_leads where id = $1', [id]))[0].owner_id).toBe(KOY)
  })

  it('records rounds in order, refuses stale saves, and closes on a purchase', async () => {
    const id = await newLead(KOY, 'ลำดับรอบ')
    await expect(record(KOY, id, 1, 2, 'sent')).rejects.toThrow('ตามลำดับรอบ')
    await record(KOY, id, 1, 1, 'waiting')
    await expect(record(NOON, id, 1, 2, 'sent')).rejects.toThrow('บันทึกข้อมูลลูกค้ารายนี้ไปก่อนแล้ว')
    await expect(team('select fu_skip_round($1, $2, $3, 2, $4)', [KOY, id, 2, ''])).rejects.toThrow('เหตุผล')
    await team('select fu_skip_round($1, $2, $3, 2, $4)', [KOY, id, 2, 'ลูกค้าไม่สะดวก'])
    await record(KOY, id, 3, 3, 'won', 'ORD-1')
    const lead = (await pg.query<{ status: string }>('select status from fu_leads where id = $1', [id])).rows[0]
    expect(lead.status).toBe('won')
    expect((await pg.query('select * from fu_orders where order_id = $1', ['ORD-1'])).rows).toHaveLength(1)
    await expect(record(KOY, id, 4, 4, 'sent')).rejects.toThrow('ไม่ได้อยู่ระหว่างติดตาม')
    const ev = await team<{ kind: string; round_no: number }>('select kind, round_no from fu_events where lead_id = $1 order by id', [id])
    expect(ev.map(e => [e.kind, e.round_no])).toEqual([['create', null], ['round', 1], ['skip', 2], ['round', 3], ['order', null]])
  })

  it('links one order to one customer only', async () => {
    const other = await newLead(KOY, 'อีกราย')
    await expect(team('select fu_set_status($1, $2, $3, $4, $5, $6)', [KOY, other, 1, 'won', '', 'ORD-1'])).rejects.toThrow('ผูกกับลูกค้ารายอื่น')
    await team('select fu_set_status($1, $2, $3, $4, $5, $6)', [KOY, other, 1, 'won', '', 'ORD-2'])
    await team('select fu_link_order($1, $2, $3)', [NOON, other, 'ORD-3'])
    expect((await team('select order_id from fu_orders where lead_id = $1 order by 1', [other])).map(r => r.order_id)).toEqual(['ORD-2', 'ORD-3'])
    await team('select fu_unlink_order($1, $2)', [KOY, 'ORD-3'])
    expect((await team('select order_id from fu_orders where lead_id = $1', [other])).map(r => r.order_id)).toEqual(['ORD-2'])
  })

  it('reopens a customer who opted out only with a reason', async () => {
    const id = await newLead(KOY, 'ขอหยุด')
    await record(KOY, id, 1, 1, 'optout')
    await expect(team('select fu_set_status($1, $2, $3, $4, $5, $6)', [KOY, id, 2, 'active', '', null])).rejects.toThrow('ระบุเหตุผล')
    await team('select fu_set_status($1, $2, $3, $4, $5, $6)', [GM, id, 2, 'active', 'ลูกค้าทักกลับมาเอง', null])
    expect(await version(id)).toBe(3)
  })

  it('blocks a repeated chat link and warns on a repeated name', async () => {
    await newLead(KOY, 'ลิงก์', null, 'https://pancake.vn/c/77')
    await expect(team(SAVE, [GM, null, null, 'คนอื่น', 'GABA', NOON, day(-1), null, 'https://pancake.vn/c/77', '', '']))
      .rejects.toThrow('ลิงก์แชตนี้มีในระบบแล้ว (ผู้ดูแล: พี่ก้อย)')
    const same = await team<{ owner_name: string }>('select * from fu_same_name($1, null)', ['ลิงก์'])
    expect(same.map(s => s.owner_name)).toEqual(['พี่ก้อย'])
  })

  it('keeps the first chat day once a round is recorded, logs edits and reassignment', async () => {
    const id = await newLead(KOY, 'แก้ไข')
    await record(KOY, id, 1, 1, 'sent')
    await expect(team(SAVE, [KOY, id, 2, 'แก้ไข', 'GABA', KOY, day(-2), null, '', '', ''])).rejects.toThrow('แก้วันที่คุยครั้งแรกไม่ได้')
    await team(SAVE, [KOY, id, 2, 'แก้ไขแล้ว', 'GABA', NOON, day(-3), '516356078238016', '', 'ราคา', 'ใหม่'])
    const notes = (await pg.query<{ kind: string; note: string }>(`select kind, note from fu_events where lead_id = $1 and kind in ('edit', 'reassign') order by id`, [id])).rows
    expect(notes).toEqual([{ kind: 'reassign', note: 'พี่ก้อย → นุ่น' }, { kind: 'edit', note: 'แก้ไข: ชื่อ, บันทึก' }])
  })

  it('refuses a first chat day in the future', async () => {
    await expect(newLead(KOY, 'อนาคต', null, '', day(2))).rejects.toThrow('ต้องไม่เกินวันนี้')
  })

  it('manages the team list from the page; someone who left keeps their customers but cannot record', async () => {
    const pim = (await team<{ id: string }>('select fu_save_staff($1, null, $2, $3, true) as id', [GM, 'พิม', 'admin']))[0].id
    await expect(team('select fu_save_staff($1, null, $2, $3, true)', [GM, 'พิม', 'admin'])).rejects.toThrow('มีชื่อ พิม ในทีมแล้ว')
    const id = await newLead(pim, 'ของพิม', pim)
    await team('select fu_save_staff($1, $2, $3, $4, false)', [GM, pim, 'พิม', 'admin'])
    await expect(record(pim, id, 1, 1, 'sent')).rejects.toThrow('เลือกชื่อของคุณก่อน')
    await expect(newLead(GM, 'ให้คนที่ออก', pim)).rejects.toThrow('ไม่พบผู้ดูแล')
    await team(SAVE, [GM, id, 1, 'ของพิม', 'GABA', pim, day(-3), '516356078238016', '', 'ราคา', 'แก้โน้ต']) // stays with พิม
    await team(SAVE, [GM, id, 2, 'ของพิม', 'GABA', KOY, day(-3), '516356078238016', '', 'ราคา', 'แก้โน้ต'])
    expect((await team<{ owner_id: string }>('select owner_id from fu_leads where id = $1', [id]))[0].owner_id).toBe(KOY)
  })

  it('imports the old app export once and deletes with the history', async () => {
    const rows = [{ name: 'นำเข้า', product: 'GABA', owner_id: NOON, first_day: '2026-11-01', page_id: '', chat_url: 'https://x.y/9',
      objection: '', notes: '', status: 'active', history: [{ round: 1, day: '2026-11-02', note: 'เก่า' }] }]
    expect((await team('select fu_import($1, $2) as n', [GM, JSON.stringify(rows)]))[0].n).toBe(1)
    expect((await team('select fu_import($1, $2) as n', [GM, JSON.stringify(rows)]))[0].n).toBe(0) // same chat link → skipped
    const id = (await team<{ id: string }>(`select id from fu_leads where name = 'นำเข้า'`))[0].id
    const r1 = (await team<{ result: string; due_day: string }>(`select result, due_day::text from fu_events where lead_id = $1 and kind = 'round'`, [id]))[0]
    expect(r1).toEqual({ result: 'legacy', due_day: '2026-11-02' })
    await expect(as(STRANGER, 'select fu_delete_lead($1, $2)', [NOON, id])).rejects.toThrow('ยังไม่ได้รับสิทธิ์')
    await team('select fu_delete_lead($1, $2)', [NOON, id])
    expect((await pg.query('select * from fu_events where lead_id = $1', [id])).rows).toEqual([])
  })
})
