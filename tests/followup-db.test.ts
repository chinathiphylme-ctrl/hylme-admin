// Runs supabase/migrations/0005_followup.sql in an in-process Postgres (PGlite) with a minimal stand-in for
// Supabase's auth schema and default grants, then checks the access rules as each kind of user.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'

const KOY = '00000000-0000-0000-0000-00000000000a'
const NOON = '00000000-0000-0000-0000-00000000000b'
const GM = '00000000-0000-0000-0000-00000000000c'
const STRANGER = '00000000-0000-0000-0000-00000000000d'

let pg: PGlite

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

const day = (offset: number) => {
  const d = new Date(Date.now() + 7 * 3600e3 + offset * 864e5)
  return d.toISOString().slice(0, 10)
}

const SAVE = `select fu_save_lead($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as id`
const newLead = async (user: string, name: string, owner: string | null = null, url = '', first = day(-3)) =>
  (await as<{ id: string }>(user, SAVE, [null, null, name, 'GABA', owner, first, '516356078238016', url, 'ราคา', '']))[0].id
const version = async (id: string) => (await pg.query<{ version: number }>('select version from fu_leads where id = $1', [id])).rows[0].version
const record = (user: string, id: string, v: number, round: number, result: string, order: string | null = null) =>
  as(user, 'select fu_record_round($1, $2, $3, $4, $5, $6) as v', [id, v, round, result, 'โน้ต', order])

beforeAll(async () => {
  pg = new PGlite()
  await pg.exec(SUPABASE_STUB)
  await pg.exec(readFileSync('supabase/migrations/0005_followup.sql', 'utf8'))
  await pg.exec(`
    insert into auth.users values ('${KOY}'), ('${NOON}'), ('${GM}'), ('${STRANGER}');
    insert into staff values ('${KOY}', 'พี่ก้อย', 'admin', true), ('${NOON}', 'นุ่น', 'admin', true), ('${GM}', 'GM', 'gm', true);
  `)
}, 60_000)

describe('follow-up database rules', () => {
  it('keeps every customer row away from anon and from signed-in non-staff', async () => {
    await newLead(KOY, 'ลับ')
    await expect(as(null, 'select * from fu_leads')).rejects.toThrow(/permission denied/)
    expect(await as(STRANGER, 'select * from fu_leads')).toEqual([])
    await expect(newLead(STRANGER, 'x')).rejects.toThrow('ยังไม่ได้รับสิทธิ์')
    await expect(as(KOY, `insert into fu_leads (name, product, owner_id, first_day) values ('x', 'y', '${KOY}', current_date)`))
      .rejects.toThrow(/permission denied/)
  })

  it('shows admins only their own customers and the GM everyone', async () => {
    const a = await newLead(KOY, 'ของก้อย')
    const b = await newLead(GM, 'ของนุ่น', NOON)
    const names = async (u: string) => (await as<{ name: string }>(u, 'select name from fu_leads')).map(r => r.name)
    expect(await names(KOY)).toContain('ของก้อย')
    expect(await names(KOY)).not.toContain('ของนุ่น')
    expect(await names(NOON)).toEqual(['ของนุ่น'])
    expect(await names(GM)).toEqual(expect.arrayContaining(['ของก้อย', 'ของนุ่น']))
    expect(await as(NOON, 'select * from fu_events where lead_id = $1', [a])).toEqual([])
    await expect(record(NOON, a, 1, 1, 'sent')).rejects.toThrow('ไม่มีสิทธิ์')
    await expect(newLead(KOY, 'ให้นุ่น', NOON)).rejects.toThrow('เฉพาะของตัวเอง')
    expect(b).toBeTruthy()
  })

  it('records rounds in order, refuses stale saves, and closes on a purchase', async () => {
    const id = await newLead(KOY, 'ลำดับรอบ')
    await expect(record(KOY, id, 1, 2, 'sent')).rejects.toThrow('ตามลำดับรอบ')
    await record(KOY, id, 1, 1, 'waiting')
    await expect(record(KOY, id, 1, 2, 'sent')).rejects.toThrow('บันทึกข้อมูลลูกค้ารายนี้ไปก่อนแล้ว')
    await expect(as(KOY, 'select fu_skip_round($1, $2, 2, $3)', [id, 2, ''])).rejects.toThrow('เหตุผล')
    await as(KOY, 'select fu_skip_round($1, $2, 2, $3)', [id, 2, 'ลูกค้าไม่สะดวก'])
    await record(KOY, id, 3, 3, 'won', 'ORD-1')
    const lead = (await pg.query<{ status: string }>('select status from fu_leads where id = $1', [id])).rows[0]
    expect(lead.status).toBe('won')
    expect((await pg.query('select * from fu_orders where order_id = $1', ['ORD-1'])).rows).toHaveLength(1)
    await expect(record(KOY, id, 4, 4, 'sent')).rejects.toThrow('ไม่ได้อยู่ระหว่างติดตาม')
    const ev = await as<{ kind: string; round_no: number; by: string }>(KOY, 'select kind, round_no, by from fu_events where lead_id = $1 order by id', [id])
    expect(ev.map(e => [e.kind, e.round_no])).toEqual([['create', null], ['round', 1], ['skip', 2], ['round', 3], ['order', null]])
    expect(ev.every(e => e.by === KOY)).toBe(true)
  })

  it('links one order to one customer only', async () => {
    const other = await newLead(KOY, 'อีกราย')
    await expect(as(KOY, 'select fu_set_status($1, $2, $3, $4, $5)', [other, 1, 'won', '', 'ORD-1'])).rejects.toThrow('ผูกกับลูกค้ารายอื่น')
    await as(KOY, 'select fu_set_status($1, $2, $3, $4, $5)', [other, 1, 'won', '', 'ORD-2'])
    await as(KOY, 'select fu_link_order($1, $2)', [other, 'ORD-3'])
    expect((await as(KOY, 'select order_id from fu_orders where lead_id = $1 order by 1', [other])).map(r => r.order_id)).toEqual(['ORD-2', 'ORD-3'])
  })

  it('lets only the GM reopen a customer who bought or opted out', async () => {
    const id = await newLead(KOY, 'ขอหยุด')
    await record(KOY, id, 1, 1, 'optout')
    await expect(as(KOY, 'select fu_set_status($1, $2, $3, $4, $5)', [id, 2, 'active', '', null])).rejects.toThrow('เฉพาะ GM')
    await as(GM, 'select fu_set_status($1, $2, $3, $4, $5)', [id, 2, 'active', 'ลูกค้าทักกลับมาเอง', null])
    expect(await version(id)).toBe(3)
  })

  it('blocks a repeated chat link and warns on a repeated name', async () => {
    await newLead(KOY, 'ลิงก์', null, 'https://pancake.vn/c/77')
    await expect(as(GM, SAVE, [null, null, 'คนอื่น', 'GABA', NOON, day(-1), null, 'https://pancake.vn/c/77', '', '']))
      .rejects.toThrow('ลิงก์แชตนี้มีในระบบแล้ว (ผู้ดูแล: พี่ก้อย)')
    const same = await as<{ owner_name: string }>(NOON, 'select * from fu_same_name($1, null)', ['ลิงก์'])
    expect(same.map(s => s.owner_name)).toEqual(['พี่ก้อย'])
  })

  it('keeps the first chat day once a round is recorded, logs edits, and lets the GM reassign', async () => {
    const id = await newLead(KOY, 'แก้ไข')
    await record(KOY, id, 1, 1, 'sent')
    await expect(as(KOY, SAVE, [id, 2, 'แก้ไข', 'GABA', null, day(-2), null, '', '', ''])).rejects.toThrow('แก้วันที่คุยครั้งแรกไม่ได้')
    await as(KOY, SAVE, [id, 2, 'แก้ไขแล้ว', 'GABA', NOON, day(-3), '516356078238016', '', 'ราคา', 'ใหม่']) // admin cannot move the owner
    expect((await pg.query<{ owner_id: string }>('select owner_id from fu_leads where id = $1', [id])).rows[0].owner_id).toBe(KOY)
    await as(GM, SAVE, [id, 3, 'แก้ไขแล้ว', 'GABA', NOON, day(-3), '516356078238016', '', 'ราคา', 'ใหม่'])
    const notes = (await pg.query<{ kind: string; note: string }>(`select kind, note from fu_events where lead_id = $1 and kind in ('edit', 'reassign') order by id`, [id])).rows
    expect(notes).toEqual([{ kind: 'edit', note: 'แก้ไข: ชื่อ, บันทึก' }, { kind: 'reassign', note: 'พี่ก้อย → นุ่น' }])
    expect(await as(KOY, 'select * from fu_leads where id = $1', [id])).toEqual([])
  })

  it('refuses a first chat day in the future', async () => {
    await expect(newLead(KOY, 'อนาคต', null, '', day(2))).rejects.toThrow('ต้องไม่เกินวันนี้')
  })

  it('imports the old app export for the GM only and deletes only for the GM', async () => {
    const rows = [{ name: 'นำเข้า', product: 'GABA', owner_id: NOON, first_day: '2026-11-01', page_id: '', chat_url: 'https://x.y/9',
      objection: '', notes: '', status: 'active', history: [{ round: 1, day: '2026-11-02', note: 'เก่า' }] }]
    await expect(as(KOY, 'select fu_import($1)', [JSON.stringify(rows)])).rejects.toThrow('เฉพาะ GM')
    expect((await as(GM, 'select fu_import($1) as n', [JSON.stringify(rows)]))[0].n).toBe(1)
    expect((await as(GM, 'select fu_import($1) as n', [JSON.stringify(rows)]))[0].n).toBe(0) // same chat link → skipped
    const id = (await as<{ id: string }>(NOON, `select id from fu_leads where name = 'นำเข้า'`))[0].id
    const r1 = (await as<{ result: string; due_day: string }>(NOON, `select result, due_day::text from fu_events where lead_id = $1 and kind = 'round'`, [id]))[0]
    expect(r1).toEqual({ result: 'legacy', due_day: '2026-11-02' })
    await expect(as(NOON, 'select fu_delete_lead($1)', [id])).rejects.toThrow('เฉพาะ GM')
    await as(GM, 'select fu_delete_lead($1)', [id])
    expect((await pg.query('select * from fu_events where lead_id = $1', [id])).rows).toEqual([])
  })
})
