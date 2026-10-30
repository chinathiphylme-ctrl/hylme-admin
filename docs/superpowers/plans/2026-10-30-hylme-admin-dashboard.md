# Hylme Admin Daily Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public web app where Hylme admins upload daily Pancake exports and see tag summaries, stuck points, and a follow-up list per page and date range.

**Architecture:** A Vite + React + TypeScript SPA parses xlsx files in the browser, strips customer PII, and sends only aggregates to Supabase through code-checked `security definer` RPCs. Reads use the anon key under read-only RLS. All numbers come from pure functions in `src/metrics/`, so they can be tested without a browser or a database.

**Tech Stack:** Vite 5.4, React 18.3.1, TypeScript 5.6, Vitest 2.1, SheetJS 0.20.3 (from cdn.sheetjs.com), @supabase/supabase-js 2.45, Supabase Postgres 17 with pgcrypto, GitHub Pages via GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-30-hylme-admin-dashboard-design.md`
**Visual reference:** the approved prototype https://claude.ai/artifact/BAGQzEMXjHPJMRbhYpvSBN. Its source is at `C:\Users\HP05\AppData\Local\Temp\claude\C--Users-HP05-Downloads-admin-dashboard\3c980f8b-0b70-44b8-9a57-8e497143de6e\scratchpad\proto\project\Main.dc.html`. Match its layout, colors and copy.

## Global Constraints

- Never persist or send: sender name, sender ID, message text, phone number, assigned user, note. Message text is read only to compute `first_kind`, then dropped.
- Never commit `*.xlsx`/`*.csv` (already in `.gitignore`). Real exports live in the parent folder `..`.
- Pages are fixed: `100379779472465` Hylme (Facebook), `igo_17841457670184062` Hylme (IG), `923678677500634` ครบจบเรื่องนอน, `516356078238016` ครบจบเรื่องไขมัน. "ทุกเพจ" = sum of the four.
- Dates are `YYYY-MM-DD` strings in Asia/Bangkok. The date tag of a day is `${d}/${m}` with no zero padding (for example `29/10` or `8/10`).
- UI copy is Thai. The fonts are IBM Plex Sans Thai (text) and IBM Plex Sans (numbers). Accent is `#1E6B4F`, critical is `#C2410C`, and the sidebar is `#0F2A20`.
- Upload limit is 20 MB per file.

## Review Focus

1. Someone uploads the combined export (sheet `ทุกหน้า`) or a file with ` today` hourly sheets. Expected: the combined file is rejected with a message, hourly sheets are skipped, and nothing is counted twice. Test in Task 3.
2. Someone re-uploads the same day and page. Expected: the old rows for that day and page are replaced, not added to. Test in Task 7 (SQL).
3. A tag export has several day columns, and the range crosses New Year (`31/12`, `1/1`). Expected: each column becomes the correct `YYYY-MM-DD`. Test in Task 3.
4. A page has no data for the range (IG and นอน on 29 ต.ค.). Expected: the rate shows `—`, there is no NaN or Infinity, and the card says there is no data. Test in Task 5.
5. A message file has conversation rows out of time order, or empty message text (a sticker or image). Expected: first and last are taken by time, and empty text gives `first_kind = 'media'`. Test in Task 4.

---

## File Structure

```
package.json, vite.config.ts, tsconfig.json, index.html, .env.example
src/config/pages.ts            PAGES, PageId, pageName()
src/parse/workbook.ts          readWorkbook(buf) → Sheet[] (name + rows as unknown[][])
src/parse/detect.ts            detectKind(sheets) → 'tagStats' | 'messages' | 'combined' | 'unknown'
src/parse/tagStats.ts          parseTagStats(sheets, fileName) → TagStatsResult
src/parse/messages.ts          parseMessages(sheets, fileName) → MessagesResult
src/parse/types.ts             shared parse types
src/grouping/rules.ts          groupOf(), STAGE_GROUPS, ALL_GROUPS, dateTag()
src/metrics/range.ts           ranges, previous period, day lists
src/metrics/daily.ts           summarize(), pageCompare(), trend()
src/metrics/conversations.ts   convStats(), followList(), segmentRates()
src/data/client.ts             supabase client
src/data/read.ts               fetch* functions
src/data/write.ts              save* functions (RPC wrappers)
src/ui/…                       App, Sidebar, FilterBar, Overview, Follow, Upload, Tags, charts
supabase/migrations/0001_init.sql
tests/fixtures/build.ts        makes fixture workbooks in memory (no real customer data)
tests/*.test.ts
scripts/verify-real.ts         local check against real exports in .. (not run in CI)
```

---

### Task 1: Scaffold and page config

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `.env.example`, `src/main.tsx`, `src/config/pages.ts`
- Test: `tests/pages.test.ts`

**Interfaces:**
- Produces: `type PageId = '100379779472465' | 'igo_17841457670184062' | '923678677500634' | '516356078238016'`; `PAGES: { id: PageId; name: string; platform: 'Facebook' | 'Instagram' }[]` in the order FB, ไขมัน, นอน, IG; `isPageId(x: string): x is PageId`; `pageName(id: PageId | 'all'): string` ('all' → 'ทุกเพจ').

- [ ] **Step 1:** Scaffold with `npm create vite@5 . -- --template react-ts`, and set `base: '/hylme-admin/'` in `vite.config.ts` because the app is served under the GitHub Pages project path. Then install `npm i react@18.3.1 react-dom@18.3.1 @supabase/supabase-js@2.45.4 https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` and `npm i -D vitest@2.1.9 tsx@4.19.2`. Add the scripts `"test": "vitest run"` and `"verify": "tsx scripts/verify-real.ts"`. `.env.example` lists `VITE_SUPABASE_URL=` and `VITE_SUPABASE_ANON_KEY=`.
- [ ] **Step 2: Failing test** `tests/pages.test.ts`: `expect(PAGES.map(p => p.id)).toEqual(['100379779472465','516356078238016','923678677500634','igo_17841457670184062'])`; `expect(isPageId('igo_17841457670184062')).toBe(true)`; `expect(isPageId('123')).toBe(false)`; `expect(pageName('all')).toBe('ทุกเพจ')`.
- [ ] **Step 3:** Run `npm test`. Expected: FAIL, module not found.
- [ ] **Step 4:** Implement `src/config/pages.ts`. The names are as in Global Constraints. IG has platform Instagram, the others Facebook.
- [ ] **Step 5:** Run `npm test && npm run build`. Expected: tests PASS and the build succeeds.
- [ ] **Step 6:** Commit `feat: scaffold app and page config`.

### Task 2: Tag grouping rules

**Files:**
- Create: `src/grouping/rules.ts`
- Test: `tests/grouping.test.ts`

**Interfaces:**
- Produces:
  - `type Group = string`.
  - `STAGE_GROUPS = ['เริ่มสนใจ','ติดเรื่องราคา','ลังเล','พร้อมสั่ง','ปิดการขาย','ออเดอร์ค้าง/มีปัญหา','เงียบหาย','ไม่ซื้อ'] as const` (indexes 6 and 7 are "lost").
  - `ALL_GROUPS: string[]` = `['ยังไม่จัดกลุ่ม', ...STAGE_GROUPS, 'ที่มาลูกค้า','โฆษณา','สินค้า','เรื่องสุขภาพ','การชำระเงิน','สะสมแต้ม','แอดมิน','อื่นๆ']`.
  - `groupOf(tag: string, overrides: Record<string, string>): Group | 'วันที่'`.
  - `dateTag(day: string): string`.

- [ ] **Step 1: Failing tests:**
  - `groupOf('29/10',{})==='วันที่'`
  - `groupOf('120250984880940',{})==='โฆษณา'`
  - `groupOf('1.สนใจ',{})==='เริ่มสนใจ'`
  - `groupOf('3. ขอโปรโมชั่น',{})==='ติดเรื่องราคา'`
  - `groupOf('7.เปรียบเทียบราคา',{})==='ติดเรื่องราคา'`
  - `groupOf('10เราทักเม้น',{})==='ที่มาลูกค้า'`
  - `groupOf('9.อื่นๆ .(ทักมั่ว)',{})==='ที่มาลูกค้า'`
  - `groupOf('มะกอก',{})==='สินค้า'`
  - `groupOf('นุ่น🤍',{})==='แอดมิน'`
  - `groupOf(' ปิด ',{})==='ปิดการขาย'` (trimmed)
  - `groupOf('ติดตาม',{})==='ยังไม่จัดกลุ่ม'`
  - `groupOf('ติดตาม',{'ติดตาม':'เงียบหาย'})==='เงียบหาย'`
  - `dateTag('2026-10-08')==='8/10'`
- [ ] **Step 2:** Run `npm test -- grouping`. Expected: FAIL.
- [ ] **Step 3:** Implement the rule order exactly as in spec §7. The numbered prefix regex is `^(\d+)\.?\s*\D`. The ad rule is `^\d{12,}$` and must be checked before the numbered rule.
- [ ] **Step 4:** Run `npm test -- grouping`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: tag grouping rules`.

### Task 3: Workbook reading, file detection, tag stats parser

**Files:**
- Create: `src/parse/types.ts`, `src/parse/workbook.ts`, `src/parse/detect.ts`, `src/parse/tagStats.ts`, `tests/fixtures/build.ts`
- Test: `tests/tagStats.test.ts`

**Interfaces:**
- Produces:
  - `type Sheet = { name: string; rows: unknown[][] }`.
  - `readWorkbook(buf: ArrayBuffer): Sheet[]` (SheetJS `read` + `sheet_to_json(ws, {header:1, defval:null})`).
  - `detectKind(sheets: Sheet[]): 'tagStats' | 'messages' | 'combined' | 'unknown'`.
  - `type TagRow = { day: string; pageId: PageId; tag: string; color: string; count: number }`.
  - `type TagStatsResult = { ok: true; fileName: string; rows: TagRow[]; days: string[]; pageIds: PageId[]; tags: {tag:string;color:string}[] } | { ok: false; fileName: string; error: string }`.
  - `parseTagStats(sheets: Sheet[], fileName: string): TagStatsResult`.
  - Fixture helpers in `tests/fixtures/build.ts`:
    - `tagStatsSheets(opts: { pages: Record<string, [tag: string, color: string, counts: (number|null)[]][]>; dayHeaders: string[]; range: string }): Sheet[]`. Each page gets two sheets, `<id>` and `<id> today`. Rows 1–3 are `ดาวน์โหลดเมื่อ: …`, the page list, and `ช่วงเวลาดาวน์โหลด: <range>`, followed by one blank row and then the header `['ID','name','color','total',...dayHeaders]`.
    - `messageSheets(rows: Record<string, unknown>[]): Sheet[]`. One sheet, whose header row holds the 20 column names from spec §5 and the original export.

- [ ] **Step 1: Failing tests:**
  - **2 pages, 1 day.** FB has `['29/10','#a',[118]], ['ปิด','#b',[8]]` and ไขมัน has `['29/10','#a',[70]], ['ปิด','#b',[19]]`, with range `29/10/2026 00:00:00 - 29/10/2026 23:59:59`. Expect:
    - `detectKind` to be `'tagStats'`
    - 4 rows
    - `rows.find(r=>r.pageId==='516356078238016'&&r.tag==='ปิด').count===19`
    - `days` to equal `['2026-10-29']`
  - **The ` today` sheets are ignored.** Put different numbers in them and expect totals to be unchanged.
  - **Multiple days and New Year.** Headers `['31/12','1/1']` with range `31/12/2026 … - 01/01/2027 …`. Expect `days` to equal `['2026-12-31','2027-01-01']`.
  - **Blank cells.** A null count gives `count===0`.
  - **Combined export.** A sheet named `ทุกหน้า` gives `detectKind==='combined'`, and `parseTagStats` returns `ok:false` with the error `'ไฟล์นี้เป็นแบบรวมทุกเพจ กรุณา export แบบแยกเพจ'`.
  - **Unknown page.** A sheet named `999` with a valid layout returns `ok:false` with the error `'ไม่พบเพจของ Hylme ในไฟล์นี้'` when no known page sheet exists.
- [ ] **Step 2:** Run `npm test -- tagStats`. Expected: FAIL.
- [ ] **Step 3:** Implement.
  - `detectKind`: if the header row contains `ID การสนทนา (conversation_id)` → messages. If any sheet name is `ทุกหน้า` → combined. If any sheet has an `ID` header row → tagStats.
  - Year: take the start date from the `ช่วงเวลาดาวน์โหลด` row. Walk the columns in order and add 1 to the year whenever the month drops.
- [ ] **Step 4:** Run `npm test -- tagStats`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: parse tag statistics exports`.

### Task 4: Message export parser (PII stripped)

**Files:**
- Create: `src/parse/messages.ts`
- Test: `tests/messages.test.ts`

**Interfaces:**
- Consumes: `Sheet`, `messageSheets()`, `isPageId`.
- Produces:
  - `type FirstKind = 'button' | 'typed' | 'media'`.
  - `type ConvRow = { day: string; conversationId: string; pageId: PageId; firstAt: string; lastAt: string; msgCount: number; firstKind: FirstKind; hasPhone: boolean; tags: string[]; pancakeUrl: string }`. `firstAt` and `lastAt` are ISO strings with `+07:00`.
  - `type MessagesResult = { ok: true; fileName: string; convs: ConvRow[]; days: string[]; pageIds: PageId[]; messageCount: number } | { ok: false; fileName: string; error: string }`.
  - `parseMessages(sheets: Sheet[], fileName: string): MessagesResult`.
  - `BUTTON_RE = /^(สนใจ(สั่งซื้อ)?|ราคา(เท่าไร)?|ช่วยเช็คราคาสินค้าหน่อยได้ไหม|ปริมาณ-ราคา)(ค่ะ|ครับ|คะ)?$/`.

- [ ] **Step 1: Failing tests** (fixture rows use fake names like `ลูกค้าทดสอบ` and the phone `0800000000`):
  - Three rows of one conversation, given out of time order: 12:05 `ราคา`, 11:00 `สนใจ`, 13:00 empty text. Expect:
    - 1 conv
    - `firstAt` ends with `T11:00:00+07:00`
    - `lastAt` ends with `T13:00:00+07:00`
    - `firstKind==='button'`
    - `msgCount===3`
  - A conversation whose first message is empty → `firstKind==='media'`. One whose first message is `มีตราฮาลาลไม่คะ` → `'typed'`.
  - Tags come from the latest row, split on `,` and trimmed: `'29/10, มะกอก,ปิด'` gives `['29/10','มะกอก','ปิด']`.
  - `hasPhone` is true if any row has `มีโทรศัพท์` equal to `True`, `true`, or `TRUE`.
  - **PII check:** `JSON.stringify(result)` contains neither `ลูกค้าทดสอบ`, `0800000000`, nor any message text from the fixture.
  - `day` is the date of `lastAt`, and `days` lists the unique days.
  - A page ID that is not one of the four gives `ok:false`, error `'ไม่พบเพจของ Hylme ในไฟล์นี้'`.
- [ ] **Step 2:** Run `npm test -- messages`. Expected: FAIL.
- [ ] **Step 3:** Implement. `แทรกที่` has the format `dd/mm/yyyy hh:mm:ss` and may come back as a string or as an Excel date. Handle both and treat the time as Bangkok time.
- [ ] **Step 4:** Run `npm test -- messages`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: parse message exports without customer PII`.

### Task 5: Daily metrics and date ranges

**Files:**
- Create: `src/metrics/range.ts`, `src/metrics/daily.ts`
- Test: `tests/daily.test.ts`, `tests/range.test.ts`

**Interfaces:**
- Consumes: `TagRow`, `groupOf`, `STAGE_GROUPS`, `dateTag`, `PAGES`.
- Produces:
  - `type RangeKey = 'day' | '7d' | '30d' | 'month' | 'custom'`.
  - `type DateRange = { from: string; to: string }`.
  - `rangeFor(key: RangeKey, latest: string, custom?: DateRange): DateRange`. `day` is `latest`; `7d` is the 7 days ending at `latest`; `month` runs from the 1st of `latest`'s month to `latest`.
  - `previousRange(r: DateRange): DateRange`. Same length, ending the day before `r.from`.
  - `daysIn(r: DateRange): string[]`.
  - `type Summary = { newChats: number; closed: number; rate: number | null; ready: number; pending: number; journey: { group: string; count: number; tags: string; share: number | null }[]; products: [string, number][]; sources: [string, number][]; ads: [string, number][] }`.
  - `summarize(rows: TagRow[], overrides: Record<string,string>, range: DateRange, page: PageId | 'all'): Summary`.
  - `pageCompare(rows, overrides, range): (Summary & { pageId: PageId })[]`.
  - `trend(rows, range, page): { day: string; newChats: number; closed: number }[]`.
  - `stuckRanking(s: Summary): { group: string; count: number }[]`. Excludes `ปิดการขาย` and zero counts, sorted descending.

- [ ] **Step 1: Failing tests** (fixture TagRows rebuilt from the verified 29 ต.ค. numbers):
  - For all pages, 29 ต.ค.:
    - `newChats 188`, `closed 27`, `rate 14.4`, `ready 28`, `pending 174`
    - journey counts `[74,95,1,28,27,6,174,25]`
    - FB `118/8/6.8`, ไขมัน `70/19/27.1`
  - **Empty page.** IG has `rate===null` and `share===null`. No value is NaN: walk the whole Summary and assert `!Number.isNaN` on every number.
  - **Two-day range.** Day 1 has `28/10` = 10 and `ปิด` = 2. Day 2 has `29/10` = 20 and `ปิด` = 3. Expect `newChats` 30. Day 2's `28/10` count must not count as new.
  - **Date ranges.**
    - `rangeFor('7d','2026-10-29')` gives `{from:'2026-10-23',to:'2026-10-29'}`.
    - `previousRange` of that gives `{from:'2026-10-16',to:'2026-10-22'}`.
    - `rangeFor('month','2026-10-29').from` is `'2026-10-01'`.
  - `stuckRanking` for all pages starts with `{group:'เงียบหาย',count:174}`.
- [ ] **Step 2:** Run `npm test -- daily range`. Expected: FAIL.
- [ ] **Step 3:** Implement.
  - `rate` is rounded to 1 decimal place.
  - `share = Math.round(count / newChats * 100)`, or `null` when `newChats` is 0.
  - `sources` lists `8.ลูกค้าเก่า`, then `10.เราทักเม้น` plus `10เราทักเม้น`, then `9.อื่นๆ .(ทักมั่ว)`, labelled `ลูกค้าเก่า`, `เราทักเม้น`, `อื่นๆ (ทักมั่ว)`.
  - `ads` lists the tags in group `โฆษณา`.
- [ ] **Step 4:** Run `npm test -- daily range`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: daily tag metrics and date ranges`.

### Task 6: Conversation metrics

**Files:**
- Create: `src/metrics/conversations.ts`
- Test: `tests/conversations.test.ts`

**Interfaces:**
- Consumes: `ConvRow`, `PageId`.
- Produces:
  - `type Stage = 'สนใจ'|'ถามสุขภาพ'|'ขอราคา'|'ขอโปร'|'ลังเล'|'พร้อมสั่ง'|'ปิดแล้ว'|'อื่นๆ'`.
  - `stageOf(tags: string[]): Stage`. `ปิด` wins. Otherwise the first matching prefix in the order `5.` `6.` `3.` `2.` `4.` `1.`.
  - `replyOf(tags): 'ยังคุยอยู่'|'อ่านไม่ตอบ'|'ไม่เปิดอ่าน'|'ทักซ้ำไม่ซื้อ'`.
  - `convStats(convs: ConvRow[]): { total; matrix: {stage; talking; read; unread; repeat}[] (excluding ปิดแล้ว); closedNow; closedNew; closedStale; mix: [label, count][]; products: [string, number][]; hours: number[24] }`.
    - Hours come from first and last only, because individual messages are not stored, so the hours chart counts conversations by the hour of `lastAt`. Label it "แชทตามชั่วโมงที่ลูกค้าทักล่าสุด".
  - `followList(convs: ConvRow[]): { conversationId; pageId; stage; status; product; last; msgs; kind; pancakeUrl }[]`.
  - `segmentRates(convs: ConvRow[], seen: { conversationId: string; tag: string; firstDay: string | null; baseline: boolean }[], range: DateRange): { ready: false; reason: string } | { ready: true; rows: { dim: 'สินค้า'|'กลุ่มลูกค้า'|'ข้อความแรก'; name: string; chats: number; closed: number; rate: number }[] }`.

- [ ] **Step 1: Failing tests:**
  - `stageOf(['ปิด','5.พร้อมสั่ง'])==='ปิดแล้ว'`
  - `stageOf(['2.ขอราคา','1.สนใจ'])==='ขอราคา'`
  - `replyOf(['ไม่เปิดอ่าน','อ่านไม่ตอบ'])==='ไม่เปิดอ่าน'`
  - **followList.**
    - Includes `พร้อมสั่ง` + `อ่านไม่ตอบ`.
    - Excludes `สนใจ` + `ไม่เปิดอ่าน`.
    - Excludes `ปิด` + `5.พร้อมสั่ง` + `ไม่เปิดอ่าน`.
    - Orders `พร้อมสั่ง` before `ขอราคา`, and `อ่านไม่ตอบ` before `ไม่เปิดอ่าน` within a stage.
  - **mix.** A conv with both `29/10` and `8.ลูกค้าเก่า` counts as `ลูกค้าเก่า`.
  - **products.** A conv with both `มะกอก` and `เดลี่ ออยล์` counts in both.
  - **segmentRates.**
    - Message data for a single day returns `ready:false`.
    - Two consecutive days with `ปิด` first seen on day 2 (not baseline) count as closed.
    - A `ปิด` marked baseline does not count.
- [ ] **Step 2:** Run `npm test -- conversations`. Expected: FAIL.
- [ ] **Step 3:** Implement. `segmentRates` only considers conversations whose earliest `day` falls within the range.
- [ ] **Step 4:** Run `npm test -- conversations`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: conversation metrics and follow-up list`.

### Task 7: Supabase project, schema and RPCs

**Files:**
- Create: `supabase/migrations/0001_init.sql`

**Interfaces:**
- Produces:
  - Tables `tag_daily`, `tag_groups`, `conversations`, `conv_tag_seen`, `uploads`, `settings`, with the columns and keys in spec §4 (snake_case).
  - RPCs (all `security definer`, `set search_path = public`, each starting with `perform assert_code(p_code)`):
    - `check_code(p_code text) returns boolean`
    - `save_tag_stats(p_code text, p_file text, p_rows jsonb) returns int`: for each distinct `(day, page_id)` in `p_rows`, delete the existing rows, then insert. Logs to `uploads`.
    - `save_messages(p_code text, p_file text, p_convs jsonb) returns int`: delete and insert per `(day, page_id)`. Then, for each `(conversation_id, tag)`, insert into `conv_tag_seen` with `baseline = not exists(select 1 from conversations where page_id = … and day < this day)` and `first_day = case when baseline then null else day end`. On conflict, keep the earliest `first_day`. Logs to `uploads`.
    - `set_tag_group(p_code text, p_tag text, p_grp text, p_ad_name text) returns void`
  - `assert_code` raises `'รหัสอัปโหลดไม่ถูกต้อง'` when `crypt(p_code, value) <> value` for `settings.key = 'upload_code'`.

- [ ] **Step 1:** Create the Supabase project `hylme-admin` in the org `eecepnlollzlyzehxajy` in region `ap-southeast-1` using the Supabase MCP. Confirm the cost: free tier, $0.
- [ ] **Step 2:** Write the migration.
  - RLS on for every table.
  - A `select` policy for `anon` on every table except `settings`.
  - No insert, update or delete policies.
  - `grant execute` on the RPCs to `anon`.
  - `create extension if not exists pgcrypto`.
- [ ] **Step 3:** Apply it with MCP `apply_migration`. Set a temporary code using `insert into settings values ('upload_code', crypt('test-code', gen_salt('bf')))`.
- [ ] **Step 4: SQL tests** (via `execute_sql`, each in a transaction with `rollback`):
  - A wrong code raises `รหัสอัปโหลดไม่ถูกต้อง`.
  - Calling `save_tag_stats` twice with the same day and page leaves `count(*)` unchanged, and `count` equals the second value.
  - The first `save_messages` marks tags as baseline. A later day with a new tag gets `first_day` set to that day.
  - Inserting into `tag_daily` as role `anon` directly fails.
  - Running `select * from settings` as `anon` returns 0 rows.
- [ ] **Step 5:** Run the MCP `get_advisors` security check. Expected: no ERROR-level issues.
- [ ] **Step 6:** Commit `feat: database schema and upload RPCs`.

### Task 8: Data layer

**Files:**
- Create: `src/data/client.ts`, `src/data/read.ts`, `src/data/write.ts`
- Test: `tests/data.test.ts`

**Interfaces:**
- Consumes: `TagRow`, `ConvRow`, the RPC names from Task 7.
- Produces:
  - `fetchTagRows(r: DateRange): Promise<TagRow[]>`. Covers `r` and `previousRange(r)` in one query.
  - `fetchLatestDay(): Promise<string | null>`
  - `fetchConvs(r: DateRange): Promise<ConvRow[]>`
  - `fetchLatestConvs(): Promise<ConvRow[]>`. The latest day for each page.
  - `fetchSeen(): Promise<…>`
  - `fetchGroups(): Promise<{ overrides: Record<string,string>; adNames: Record<string,string> }>`
  - `fetchUploads(): Promise<{ uploadedAt; kind; fileName; dayFrom; dayTo; pageIds; rows }[]>`
  - `saveTagStats(code, fileName, rows)`, `saveMessages(code, fileName, convs)`, `saveTagGroup(code, tag, grp, adName)`, `checkCode(code)`.
  - `toDbTagRow` / `fromDbTagRow` and `toDbConv` / `fromDbConv` mappers (camelCase to snake_case and back).

- [ ] **Step 1: Failing tests** on the mappers only: a round trip `fromDbConv(toDbConv(x))` deep-equals `x`, and `toDbConv` has no keys beyond the spec §4 columns.
- [ ] **Step 2:** Run `npm test -- data`. Expected: FAIL.
- [ ] **Step 3:** Implement.
  - Page through results with `.range()` in steps of 1000 rows.
  - Turn RPC errors into a thrown `Error` with the Postgres message, which is already in Thai.
- [ ] **Step 4:** Run `npm test -- data`. Expected: PASS.
- [ ] **Step 5:** Write the project URL and publishable key from MCP (`get_project_url`, `get_publishable_keys`) into `.env.production`, and add `!.env.production` to `.gitignore`. These values are public by design. Copy the same values into a gitignored `.env.local` for dev.
- [ ] **Step 6:** Commit `feat: supabase data layer`.

### Task 9: App shell and Overview screen

**Files:**
- Create: `src/ui/App.tsx`, `src/ui/theme.css`, `src/ui/Sidebar.tsx`, `src/ui/FilterBar.tsx`, `src/ui/Overview.tsx`, `src/ui/charts.tsx` (Ring, Bar, StackedBar, HourBars)

**Interfaces:**
- Consumes: everything from Tasks 5, 6 and 8.
- Produces: `App` holds the state `{ tab, page, rangeKey, custom }` and loads data once per range.

- [ ] **Step 1:** Build the Overview to match the prototype, in this order:
  - hero
  - 4 KPI cards, each with a delta against `previousRange`, shown as `+12 จากช่วงก่อน`, or `—` when the previous period has no data
  - insights
  - stuck points and fix-first list
  - page cards
  - conversation drill-down: matrix, mix and hours, plus `segmentRates` cards when `ready`; otherwise the prototype's explanation box showing `reason`
  - trend
  - products, sources and ads

  The range chips are enabled once more than one day exists. Insight copy and fix-first advice are copied from the prototype's `ADVICE` and insight templates. Each insight is hidden when its inputs are 0.
- [ ] **Step 2:** Use a responsive layout. At widths up to 900px the sidebar becomes a top bar with nav that scrolls horizontally, and there is no horizontal page scroll at 360px.
- [ ] **Step 3:** States:
  - Loading shows skeleton cards.
  - No data at all shows "ยังไม่มีข้อมูล อัปโหลดไฟล์แรกได้ที่เมนูอัปโหลด".
  - A fetch error shows "โหลดข้อมูลไม่ได้ ลองรีเฟรช" and the error text.
- [ ] **Step 4:** Run `npm run build && npm test`. Expected: both pass. Then run `npm run dev` and check the screen against the prototype with real data loaded in Task 11.
- [ ] **Step 5:** Commit `feat: overview screen`.

### Task 10: Follow, Upload and Tags screens

**Files:**
- Create: `src/ui/Follow.tsx`, `src/ui/Upload.tsx`, `src/ui/Tags.tsx`
- Test: `tests/upload-plan.test.ts`

**Interfaces:**
- Consumes: `readWorkbook`, `detectKind`, `parseTagStats`, `parseMessages`, the save functions, `groupOf`.
- Produces: `planUpload(results: (TagStatsResult | MessagesResult)[], existingDays: Set<string>, overrides): { files: {fileName; kind; summary; error?}[]; overwrites: string[]; newUnassigned: string[] }`. This is pure logic used by Upload.tsx.

- [ ] **Step 1: Failing tests for `planUpload`:**
  - Reports `overwrites` for days already in the database.
  - Lists `newUnassigned` tags, but not date tags or ad tags.
  - Keeps a failed file in `files` with its `error` and leaves other files unaffected.
- [ ] **Step 2:** Run `npm test -- upload-plan`. Expected: FAIL. Implement it, then run again. Expected: PASS.
- [ ] **Step 3:** Build the screens as in the prototype:
  - **Follow:** filter cards by stage, and a table where "เปิดใน Pancake" is an `<a href={pancakeUrl} target="_blank" rel="noopener">`.
  - **Upload:**
    - Drop zone plus file picker, with `accept=".xlsx"` and a 20 MB check.
    - A parsed summary of each file.
    - An overwrite warning.
    - A code field and a save button. Save calls the RPCs file by file and shows success or the error message.
    - A month calendar fed by `fetchUploads`.
    - Upload history.
  - **Tags:**
    - Select a group per tag.
    - An ad-name input for tags in `โฆษณา`.
    - Changes are saved through `saveTagGroup` and need the code, which is entered once per session and kept in `sessionStorage`.
- [ ] **Step 4:** Run `npm run build && npm test`. Expected: both pass.
- [ ] **Step 5:** Commit `feat: follow-up, upload and tag screens`.

### Task 11: Real-data verification and deploy

**Files:**
- Create: `scripts/verify-real.ts`, `README.md` (Thai: how to upload daily, how to change the upload code)

- [ ] **Step 1:** Write `scripts/verify-real.ts`. It reads `../pages_statistics_tag_1793335738.xlsx` and `../EXPORT_MESSAGE_1793335974628.xlsx` with the app's own parse and metrics code, then asserts:
  - all pages `188/27/28/174`
  - FB `118/8/11/109`
  - ไขมัน `70/19/17/65`
  - convs 141 from 255 messages
  - mix `108/11/22`
  - `closedNow 17`, `closedNew 2`
  - `followList().length === 58`
  - no `ok:false`

  It prints `verify ok` when everything passes.
- [ ] **Step 2:** Run `npm run verify`. Expected: `verify ok`.
- [ ] **Step 3:** Ask the user for the real upload code, then set it with `update settings set value = crypt('<code>', gen_salt('bf')) where key='upload_code'`. Do not write the code in any file.
- [ ] **Step 4:** Deploy to GitHub Pages.
  - Install the GitHub CLI with `winget install --id GitHub.cli -e`. The user then runs `! gh auth login` once.
  - Add `.github/workflows/pages.yml`. It runs on push to `main` and does: `actions/checkout@v4`, `actions/setup-node@v4` (node 22, npm cache), `npm ci`, `npm test`, `npm run build`, `actions/upload-pages-artifact@v3` (path `dist`), then `actions/deploy-pages@v4`. Permissions are `pages: write` and `id-token: write`.
  - Before pushing, run `git ls-files | grep -Ei '\.(xlsx|xls|csv)$'`. Expected: no output.
  - Create and push with `gh repo create hylme-admin --public --source . --push`.
  - Enable Pages from Actions with `gh api -X POST repos/{owner}/hylme-admin/pages -f build_type=workflow`.
  - Wait for the run with `gh run watch`. Expected: success, and the site loads at `https://<owner>.github.io/hylme-admin/`.
- [ ] **Step 5:** Upload both real files on the live site, and check that the Overview for 29 ต.ค. shows the numbers from Step 1.
- [ ] **Step 6:** Commit `chore: real-data check, README, deploy`.
