// Runs supabase/migrations/0010_order_chats.sql in PGlite with a stand-in for Supabase's roles and assert_code.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'

let pg: PGlite

const STUB = `
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  create function assert_code(p_code text) returns void language plpgsql security definer set search_path = public as $$
  begin if p_code is distinct from 'ok' then raise exception 'รหัสอัปโหลดไม่ถูกต้อง'; end if; end $$;
`

const anon = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> =>
  pg.transaction(async tx => {
    await tx.exec('set local role anon')
    return (await tx.query<T>(sql, params)).rows
  })

beforeAll(async () => {
  pg = new PGlite()
  await pg.exec(STUB)
  await pg.exec(readFileSync('supabase/migrations/0010_order_chats.sql', 'utf8'))
})

describe('save_order_chats', () => {
  it('stores pairs, upserts by order and records the sync', async () => {
    await anon(`select save_order_chats('ok', $1::jsonb)`, [JSON.stringify([
      { order_id: '1', conversation_id: 'p_a', page_id: 'p', day: '2026-11-26' },
      { order_id: '2', conversation_id: 'ln_x', page_id: null, day: '2026-11-26' },
      { order_id: '', conversation_id: 'p_b', page_id: 'p', day: '2026-11-26' }])])
    await anon(`select save_order_chats('ok', $1::jsonb)`, [JSON.stringify([
      { order_id: '1', conversation_id: 'p_c', page_id: 'p', day: '2026-11-27' }])])
    expect(await anon(`select order_id, conversation_id, to_char(day, 'YYYY-MM-DD') as day from order_chats order by order_id`))
      .toEqual([{ order_id: '1', conversation_id: 'p_c', day: '2026-11-27' }, { order_id: '2', conversation_id: 'ln_x', day: '2026-11-26' }])
    expect((await anon(`select rows from order_chat_sync`))[0]).toEqual({ rows: 1 })
  })

  it('rejects a wrong code and direct writes', async () => {
    await expect(anon(`select save_order_chats('bad', '[]'::jsonb)`)).rejects.toThrow('รหัสอัปโหลดไม่ถูกต้อง')
    await expect(anon(`insert into order_chats (order_id, conversation_id, day) values ('9', 'x', '2026-11-26')`)).rejects.toThrow()
    await expect(anon(`update order_chat_sync set rows = 0`)).rejects.toThrow()
  })
})
