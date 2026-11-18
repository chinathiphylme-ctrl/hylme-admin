// Runs 0007 in PGlite on stand-ins for the 0001 tables: day_sigs() tells the browser which days of chats and tag
// counts changed, so it only downloads those.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'

let pg: PGlite

const STUB = `
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  create table tag_daily (day date not null, page_id text not null, tag text not null, color text not null default '',
    count int not null, primary key (day, page_id, tag));
  create table conversations (
    day date not null, conversation_id text not null, page_id text not null, first_at timestamptz not null,
    last_at timestamptz not null, msg_count int not null, first_kind text not null, has_phone boolean not null default false,
    tags text[] not null default '{}', pancake_url text not null default '', topics text[] not null default '{}',
    primary key (day, conversation_id));
  alter table tag_daily enable row level security;
  alter table conversations enable row level security;
  create policy "public read" on tag_daily for select to anon, authenticated using (true);
  create policy "public read" on conversations for select to anon, authenticated using (true);
  grant select on tag_daily, conversations to anon, authenticated;
`

type Sig = { kind: string; day: string; n: number; sig: string }
const sigs = async () => pg.transaction(async tx => {
  await tx.exec('set local role anon')
  return (await tx.query<Sig>(`select kind, day::text as day, n, sig from day_sigs() order by kind, day`)).rows
})
const conv = (day: string, id: string, tags = '{}') => pg.query(
  `insert into conversations (day, conversation_id, page_id, first_at, last_at, msg_count, first_kind, tags)
   values ($1, $2, 'p', now(), now(), 1, 'typed', $3)`, [day, id, tags])

beforeEach(async () => {
  pg = new PGlite()
  await pg.exec(STUB)
  await pg.exec(readFileSync('supabase/migrations/0007_day_sigs.sql', 'utf8'))
})

describe('day_sigs', () => {
  it('gives each day of chats and of tag counts a row count and a fingerprint, readable without signing in', async () => {
    await conv('2026-11-01', 'a'); await conv('2026-11-01', 'b'); await conv('2026-11-02', 'c')
    await pg.query(`insert into tag_daily values ('2026-11-01', 'p', 'ปิด', '#f00', 3)`)
    const s = await sigs()
    expect(s.map(x => [x.kind, x.day, x.n])).toEqual([['conv', '2026-11-01', 2], ['conv', '2026-11-02', 1], ['tag', '2026-11-01', 1]])
    expect(s.every(x => /^[0-9a-f]{32}$/.test(x.sig))).toBe(true)
  })

  it('changes a day’s fingerprint only when a row of that day changes', async () => {
    await conv('2026-11-01', 'a'); await conv('2026-11-02', 'c')
    const before = await sigs()
    expect(await sigs()).toEqual(before)
    await pg.query(`update conversations set tags = '{ปิด}' where conversation_id = 'c'`)
    const after = await sigs()
    expect(after[0]).toEqual(before[0])
    expect(after[1].sig).not.toBe(before[1].sig)
    await pg.query(`update tag_daily set count = 1`) // no tag rows yet: nothing to change
    await pg.query(`insert into tag_daily values ('2026-11-02', 'p', 'x', '', 1)`)
    const t1 = (await sigs()).find(x => x.kind === 'tag')!
    await pg.query(`update tag_daily set count = 2`)
    expect((await sigs()).find(x => x.kind === 'tag')!.sig).not.toBe(t1.sig)
  })
})
