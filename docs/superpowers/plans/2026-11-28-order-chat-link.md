# Order ↔ Chat Link — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each hour the existing Pancake order sync sends (order_id, conversation_id, page_id, day) pairs to hylme-admin; the upload screen's tag-check card shows, per day, which chat-page orders' chats lack a close tag and which closed chats have no order.

**Architecture:** V3 `pancake_export.py` writes a sidecar JSON of pairs; data sec `pancake_sync.mjs` posts it through a new module `tools/order_chats.mjs` to a new Supabase RPC `save_order_chats` (migration 0010, table `order_chats` + one-row `order_chat_sync`). In hylme-admin a pure `orderCheck()` turns orders + pairs + chats + close-tag first days into the card's numbers; `TagCheckCard` fetches the day's orders and pairs and renders an "ออเดอร์" block.

**Tech Stack:** React 18 + TS + vitest + PGlite (hylme-admin); Node 22 ESM (data sec); Python 3 (V3 `.runtime\python\python.exe`).

**Spec:** `docs/superpowers/specs/2026-11-28-order-chat-link-design.md`

## Global Constraints

- Pairs carry only `order_id, conversation_id, page_id, day` — no amount, items, status, name, phone, address.
- Order counts and sales in hylme-admin still come from uploaded order files; nothing about `pancake_orders` changes.
- The data sec sync must behave exactly as before when the push fails, the config is missing, or `--dry-run` is used: log one `⚠` line and carry on; never change its exit code or skip the dashboard save.
- No extra Pancake API calls.
- `HYLME_CRM_V3` is not a git repo: copy `tools/pancake_export.py` to `tools/pancake_export.py.bak-2026-11-28` before editing.
- `data sec/private/` never enters git; the push config lives at `data sec/private/hylme_admin.json` `{ "url", "anonKey", "code" }`, written by the owner.
- Migration touches only its new objects; never revoke grants on other functions (shared project).
- Card copy neutral, no customer names/phones/text; numbers only plus "เปิดใน Pancake".
- N = live orders (`orderLive`) in `pancake_orders` with `page_id` set and `day` = the card's day. LINE pairs (`conversation_id` starts `ln_`) with `day` = card day are a separate line, not in N.
- "ติดปิดแต่ไม่พบออเดอร์" window: pair `day` from card day −3 to +3.

## Review Focus

- A pair whose order is cancelled/returned in `pancake_orders` must not count in N or as matched — test in Task 2.
- An order with a pair whose chat isn't in any loaded conversations row goes to "หาแชทไม่เจอ", not "ยังไม่ติดปิด" — test in Task 2.
- A chat with an old ปิด tag (first seen before the card day) must not appear in "ติดปิดแต่ไม่พบออเดอร์" — test in Task 2.
- `save_order_chats` called twice with the same rows leaves one row each and updates changed `conversation_id` — test in Task 1.
- Push of more than 500 pairs is split into several RPC calls — test in Task 5.

---

### Task 1: Migration 0010 — `order_chats`, `order_chat_sync`, `save_order_chats`

**Files:**
- Create: `supabase/migrations/0010_order_chats.sql`
- Test: `tests/order-chats-db.test.ts` (PGlite, same stub style as `tests/followup-sync.test.ts`: roles anon/authenticated, `assert_code` accepting `'ok'`)

**Interfaces:**
- Produces (SQL):
  - `order_chats (order_id text primary key, conversation_id text not null, page_id text, day date not null, updated_at timestamptz not null default now())`, index on `day`, RLS on, `public read` select policy for anon/authenticated, revoke insert/update/delete/truncate from anon/authenticated.
  - `order_chat_sync (id int primary key default 1 check (id = 1), at timestamptz not null, rows int not null)`, same read policy and revokes.
  - `save_order_chats(p_code text, p_rows jsonb) returns int` security definer, `perform assert_code(p_code)`, upsert by `order_id` only where any of conversation_id/page_id/day differs (`is distinct from`), then upsert `order_chat_sync` (1, now(), jsonb_array_length(p_rows)); returns the number of rows in `p_rows`. Rows with empty `order_id` or `conversation_id` are skipped. `revoke execute … from public, anon, authenticated; grant execute … to anon, authenticated`.

- [ ] **Step 1: Write the failing tests**

```ts
it('stores pairs, upserts by order and records the sync', async () => {
  await anon(`select save_order_chats('ok', $1::jsonb)`, [JSON.stringify([
    { order_id: '1', conversation_id: 'p_a', page_id: 'p', day: '2026-11-26' },
    { order_id: '2', conversation_id: 'ln_x', page_id: null, day: '2026-11-26' },
    { order_id: '', conversation_id: 'p_b', page_id: 'p', day: '2026-11-26' }])])
  await anon(`select save_order_chats('ok', $1::jsonb)`, [JSON.stringify([
    { order_id: '1', conversation_id: 'p_c', page_id: 'p', day: '2026-11-27' }])])
  expect(await anon(`select order_id, conversation_id, to_char(day,'YYYY-MM-DD') day from order_chats order by order_id`))
    .toEqual([{ order_id: '1', conversation_id: 'p_c', day: '2026-11-27' }, { order_id: '2', conversation_id: 'ln_x', day: '2026-11-26' }])
  expect((await anon(`select rows from order_chat_sync`))[0]).toEqual({ rows: 1 })
})
it('rejects a wrong code and direct writes', async () => {
  await expect(anon(`select save_order_chats('bad', '[]'::jsonb)`)).rejects.toThrow('รหัสอัปโหลดไม่ถูกต้อง')
  await expect(anon(`insert into order_chats values ('9','x',null,'2026-11-26')`)).rejects.toThrow()
})
```

- [ ] **Step 2:** `npx vitest run tests/order-chats-db.test.ts` — expected: FAIL (migration file missing / function does not exist).
- [ ] **Step 3:** Write the migration.
- [ ] **Step 4:** `npx vitest run` — expected: all pass.
- [ ] **Step 5:** Commit `feat(db): order_chats pairs from the Pancake sync (migration 0010)`.

### Task 2: `orderCheck()` — the card's numbers

**Files:**
- Create: `src/metrics/orderCheck.ts`
- Test: `tests/orderCheck.test.ts`

**Interfaces:**
- Consumes: `orderLive` (`src/followup/report.ts`), `isCloseTag` (`src/grouping/rules.ts`), `addDays` (`src/metrics/range.ts`), `ConvRow`, `OrderRow`, `Seen` (`src/metrics/conversations.ts`).
- Produces:

```ts
export type OrderChat = { orderId: string; conversationId: string; pageId: string | null; day: string }
export type OrderCheck = {
  hasOrders: boolean                       // any pancake_orders row (any page/status) on the day
  orders: number                           // N
  matched: number                          // N orders whose pair's chat has a conversations row
  closed: number                           // matched and latest row has a close tag
  notClosed: { orderId: string; conv: ConvRow }[]   // matched, latest row has no close tag
  noChat: string[]                         // order ids: no pair, or pair's chat has no row
  line: number                             // LINE pairs with day = the day
  closedNoOrder: ConvRow[]                 // that day's rows whose close tag first_day = day, no pair day in [day-3, day+3]
  windowOpen: boolean                      // day + 3 > today
}
export function orderCheck(day: string, today: string, orders: OrderRow[], pairs: OrderChat[], convs: ConvRow[], seen: Seen[]): OrderCheck
```

"Latest row" = the `convs` row with the greatest `day` for that `conversationId`. `orders` may hold other days; filter to `day`. `pairs` may hold days −3..+3.

- [ ] **Step 1: Write the failing tests** — one `it` per Review Focus line for this task plus a full example:

```ts
// day 2026-11-26; orders: A live page order (pair → chat a, latest row has ปิดAds), B live page order (pair → chat b, no close tag),
// C live page order with no pair, D cancelled page order (pair → chat a), E order with pageId null (LINE/other, not in N),
// F live page order with pair → chat z that has no conversations row
// pairs also: ln_1 on 2026-11-26 (LINE), chat c on 2026-11-29 (inside window)
// convs on 2026-11-26: a [ปิดAds] (seen first_day 26), c [ปิด] (seen 26), d [ปิด] (seen 26, no pair), e [ปิด] (seen 2026-11-20, old)
expect(r).toMatchObject({ hasOrders: true, orders: 4, matched: 2, closed: 1, line: 1, windowOpen: true })
expect(r.notClosed.map(x => x.orderId)).toEqual(['B'])
expect(r.noChat).toEqual(['C', 'F'])
expect(r.closedNoOrder.map(c => c.conversationId)).toEqual(['d'])
// with today '2026-11-30': windowOpen false; with no orders that day: hasOrders false
```

- [ ] **Step 2:** `npx vitest run tests/orderCheck.test.ts` — expected: FAIL (module missing).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npx vitest run` — expected: all pass.
- [ ] **Step 5:** Commit `feat(tag-check): match orders to chats for the card`.

### Task 3: Card block and data wiring

**Files:**
- Modify: `src/data/read.ts` (add `fetchOrderChats(from: string, to: string): Promise<OrderChat[]>` and `fetchOrderChatSync(): Promise<string | null>` = `order_chat_sync.at` or null; both return empty/null when the table is missing so the card still works before the migration), `src/ui/TagCheckCard.tsx`, `src/ui/Upload.tsx`, `src/ui/App.tsx`
- Consumes: `orderCheck`, `OrderChat` (Task 2), `fetchOrders` (existing).

Wiring: `App` passes `allConvs={base.allConvs}` and `seen={base.seen}` to `UploadScreen`; `Upload` passes them to `TagCheckCard`. `TagCheckCard` loads, once per set of shown days, `fetchOrders({ from: min, to: max })`, `fetchOrderChats(min − 3, max + 3)` and `fetchOrderChatSync()`; while loading shows `กำลังโหลดออเดอร์…`; on error shows `โหลดออเดอร์ไม่ได้: <message>` and the tag part still renders.

Per day block (under the tag tables, title `ออเดอร์`):
- `hasOrders` false → `ยังไม่มีไฟล์ออเดอร์ของวันนี้`
- else rows: `ออเดอร์จากแชทเพจ {orders} ใบ · จับคู่แชทได้ {matched}`, `แชทติดแท็กปิดแล้ว {closed}`, `แชทยังไม่ติดแท็กปิด {notClosed.length}` (+ `<details>` list: เพจ · เลขออเดอร์ · `เปิดใน Pancake`), `หาแชทไม่เจอ {noChat.length}` (+ list of order numbers), `ติดแท็กปิด แต่ไม่พบออเดอร์ {closedNoOrder.length}` (+ list like the incomplete list), `ออเดอร์จาก LINE {line} ใบ — ไม่มีแชทในไฟล์ข้อความ จึงตรวจแท็กไม่ได้` when `line > 0`.
- `windowOpen` → small note `ออเดอร์ที่ยืนยันหลังจากนี้อาจยังไม่เข้า`.
- Card footer adds `คู่ออเดอร์↔แชทจาก Pancake อัปเดตล่าสุด {d MMM HH:MM}` or `ยังไม่มีคู่ออเดอร์↔แชทจาก Pancake` when null.

- [ ] **Step 1:** Implement the fetchers, card block and props.
- [ ] **Step 2:** `npm run build` — expected: no errors. `npx vitest run` — all pass.
- [ ] **Step 3:** Commit `feat(upload): order block in the tag check card`.

### Task 4: V3 export writes the pairs

**Files:**
- Backup: `C:\Users\HP05\Downloads\HYLME_CRM_V3\tools\pancake_export.py` → `pancake_export.py.bak-2026-11-28`
- Modify: same file — `main()` accepts `--chats FILE`; new `def chat_pair(o) -> dict | None` returning `{order_id, conversation_id, page_id, day}` (`order_id` = `str(o.get('system_id') or o.get('id'))`, `page_id` = `str(o.get('page_id') or (o.get('page') or {}).get('id') or '') or None`, `day` = `(confirm_of(o)[0] or th_time(o.get('inserted_at'))).date().isoformat()`), None when `conversation_id` is empty; in the existing loop, for each order whose `order_rows` returned rows, collect `chat_pair(o)`; after `write_xlsx`, when `--chats` is given write the list as UTF-8 JSON and print `คู่ออเดอร์↔แชท {n} ใบ -> {path}`.
- Test: `C:\Users\HP05\Downloads\HYLME_CRM_V3\tools\test_chat_pair.py` (plain asserts, run with the bundled python): FB order → pair; LINE `ln_` order → pair with page_id from `page.id`; no conversation_id → None; confirm date wins over inserted_at.

- [ ] **Step 1:** Backup, write `test_chat_pair.py`, run `.runtime\python\python.exe -I tools\test_chat_pair.py` from V3 root — expected: FAIL (`chat_pair` missing). (The test imports the module by path with `importlib`; `-I` keeps the cwd off `sys.path`.)
- [ ] **Step 2:** Implement; rerun — expected: `ok`.
- [ ] **Step 3:** `.runtime\python\python.exe -I -m py_compile tools\pancake_export.py` — expected: no output. No live run here (Pancake rate limit).

### Task 5: data sec sync pushes the pairs

**Files:**
- Create: `C:\Users\HP05\Downloads\data sec\tools\order_chats.mjs` exporting `readPairs(file) -> Promise<Pair[]>` (missing file → `[]`), `loadConfig(file) -> Promise<{url, anonKey, code} | null>` (missing/invalid → null), `pushPairs(cfg, pairs, fetchImpl = fetch) -> Promise<number>` (POST `${url}/rest/v1/rpc/save_order_chats`, headers `apikey`, `Authorization: Bearer <anonKey>`, `Content-Type: application/json`, body `{ p_code, p_rows }`, batches of 500, throws on non-2xx with status + text).
- Create: `C:\Users\HP05\Downloads\data sec\tools\test_order_chats.mjs` (same style as the other `tools/test_*.mjs`): 1,201 pairs → 3 calls of 500/500/201 with the right URL/headers/body; non-2xx throws; `readPairs` of a missing file → `[]`; `loadConfig` of a missing file → null.
- Modify: `C:\Users\HP05\Downloads\data sec\tools\pancake_sync.mjs` step 1: add `'--chats', tmpChats` to the export args, read pairs before the `finally` removes both temp files; right after `conv`/`fresh` are built and before step 2, unless `--dry-run`: `try { cfg2 = await loadConfig(private/hylme_admin.json); if (!cfg2) log('⚠ ไม่ได้ส่งคู่ออเดอร์↔แชทไปเว็บแอดมิน — ยังไม่มี private/hylme_admin.json'); else log('↗ ส่งคู่ออเดอร์↔แชท ' + await pushPairs(cfg2, pairs) + ' ใบไปเว็บแอดมิน') } catch (e) { log('⚠ ส่งคู่ออเดอร์↔แชทไม่สำเร็จ: ' + e.message) }`. In `--dry-run` log `🧪 คู่ออเดอร์↔แชท {n} ใบ (ไม่ส่ง)`.
- Modify: `C:\Users\HP05\Downloads\data sec\README.md` — short section "ส่งคู่ออเดอร์↔แชทไปเว็บแอดมิน" with the config shape (no real values).

- [ ] **Step 1:** Write `test_order_chats.mjs`; `node tools/test_order_chats.mjs` — expected: FAIL (module missing).
- [ ] **Step 2:** Write `order_chats.mjs`; rerun — expected: all checks print ok.
- [ ] **Step 3:** Hook into `pancake_sync.mjs`; `node --check tools/pancake_sync.mjs` — expected: no output. Run the repo's other `tools/test_*.mjs` that touch the sync (`test_pagestat.mjs`) — expected: pass.
- [ ] **Step 4:** Commit in data sec: `Pancake sync: send order ↔ chat pairs to the admin site (no customer data)`.

### Task 6: Hand-off (stops for the owner)

- [ ] Report results. Ask the owner before each of: apply migration 0010 to production Supabase; create `data sec/private/hylme_admin.json` (owner types the upload code — give the shape and the url/anon key values from hylme-admin `.env.production`); run the sync once with `--force` to fill 45 days; merge + push hylme-admin (deploys) and push data sec.
