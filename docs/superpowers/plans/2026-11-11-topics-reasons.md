# คัดประโยคอัตโนมัติ + เหตุผลซื้อ/ไม่ซื้อ + อันดับโฆษณา Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tag every chat with keyword topics at upload, suggest customer sentences for the quotes page while uploading (never stored unless picked), show buy/not-buy reasons on the "เสียงลูกค้า" tab, and rank ads best to worst.

**Architecture:** A pure keyword classifier (`src/parse/topics.ts`) runs inside `parseMessages`. It adds `topics` to each `ConvRow` and returns in-memory `candidates`. Migration 0004 stores `conversations.topics` (names only). `Lead` gains `topics`. `src/metrics/reasons.ts` computes the three reason views from leads. The Upload screen shows candidates after a successful save. `adScores` gains a `rank`.

**Tech Stack:** React 18 + TypeScript + Vite, Vitest, Supabase (Postgres RPC), SheetJS (existing).

**Spec:** `docs/superpowers/specs/2026-11-11-topics-reasons-design.md`. The ranking requirement comes from chat on 11/11: "อันดับจากดีสุดไปแย่สุด ใช้คะแนนที่หักความไม่แน่นอน".

## Execution status (Codex, 11 Nov 2026)

Implementation and local verification are complete for Tasks 1, 3, 4, 5, 6, 7 and the functional fixes in Task 8. Task 2 code and migration file are complete; applying the migration is pending because the connected Supabase tool denies project access. Task 9 local real-data checks and browser checks are complete; live upload/save verification and merge/push remain pending. The checkboxes below are the original recipe, not a claim that every original commit/test ordering step was performed.

Validation: 161 tests / 18 files pass, production build passes, existing real-data verification passes. Seven real message exports cover 1,213 distinct chats; candidate counts are 7-21 per file with no address/email matches. Desktop/mobile browser checks cover the reasons card, empty page, ad ranking, admin close rates, source clamp and automatic/manual range transitions. See [validation and remaining steps](../topics-reasons-validation.md).

Implementation details: `BUTTON_RE` moved to a shared `buttons.ts` module and remains re-exported from `messages.ts` to avoid an import cycle. Phone masking runs before postcode screening so valid phone-only sentences are retained; address words still exclude an address-bearing sentence. Topic coverage copy distinguishes no keyword match from a legacy upload, since both have an empty topics array. Existing database reads fall back to the old columns until migration; message writes fail clearly rather than silently losing topics.

## Global Constraints

- Customer message text never reaches the database. Only topic names are stored. Candidates live in React state on the Upload screen and are gone when it unmounts.
- Topics = `QUOTE_CATEGORIES` minus `อื่นๆ`, plus the new category `ขอคิดก่อน`, inserted before `เทียบยี่ห้ออื่น`. Keyword regexes come verbatim from spec §2. Button texts (`BUTTON_RE`) never get a topic.
- Candidate topics (spec §3 order, rarest first): `กลัวผลข้างเคียง`, `ขอคิดก่อน`, `ไม่มั่นใจ/ขอรีวิว`, `เทียบยี่ห้ออื่น`, `อาการ/สุขภาพ`, `คำชม`, `ราคา/แพง`. `ส่งของ/จ่ายเงิน` is never a candidate.
- Candidate filter: non-button, 15–300 chars after trim, no address words (`ตำบล|ต\.|อำเภอ|อ\.|จังหวัด|จ\.|รหัสไปรษณีย์|ถนน|หมู่|ม\.\s*\d|\d{5}`), and no email. Text passes through `maskPhones`. At most 1 per chat and 30 per file.
- Buy-reason tags: `ส่วนผสม`, `เคยใช้และพอใจ`, `รีวิวจากผู้ใช้`, `คุณภาพสินค้า`, `มีคนแนะนำ`, `ดูแลสุขภาพ`, `โปรโมชั่น`, `มาตรฐาน/แหล่งผล`. Not-buy-reason tags: `ราคาแพง`, `ติดราคา`, `ขอคิดดูก่อน`, `ข้อมูลไม่เพียงพ`, `ไม่ตรงความต้องก`, `เปรียบเทียบแบรน`, `ขาดความมั่นใจ`, `รอโปร`, `7.เปรียบเทียบราคา`, `ไม่สนใจ` (exact strings, spec §4.2).
- Admin name tags: `พี่ก้อย` → พี่ก้อย, `นุ่น🤍` → นุ่น; per-admin rate counts leads with `startDay ≥ 2026-11-04` (spec §8.1).
- A topic with fewer than 10 chats is flagged "ข้อมูลยังน้อย" (`MIN_TOPIC_CHATS = 10`).
- Ad rank = order by Wilson lower bound desc, then chats desc, among ads with `chats ≥ MIN_CHATS`. Ads below that have `rank: null`.
- Thai UI copy, existing classes, and no new dependencies. Edit files with the Edit tool (keep their existing line endings).

## Review Focus

1. An old message export with no topics (uploaded before 0004): the reasons section shows "มีหัวข้อ X จาก Y แชท…" and no wrong percentages. Test in Task 3 (`topicCoverage`).
2. A sentence holding an address or house number with a phone ("บ้านเลขที่ 12 ม.3 ต.บางรัก 0812345678 ส่งปลายทางค่ะ") must never become a candidate. Test in Task 2.
3. A file with 0 candidates: the panel shows a one-line "ไม่มีประโยคที่เข้าหัวข้อ" and nothing breaks. Test in Task 2 (`candidates: []`), UI in Task 5.
4. Saving a candidate with a wrong or missing upload code shows the RPC's Thai error on that row, and the other rows stay usable. UI in Task 5.
5. A page or range with 0 new chats in the reasons section shows no NaN or Infinity. Test in Task 3.

---

### Task 1: Topic classifier

**Files:**
- Create: `src/parse/topics.ts`
- Modify: `src/metrics/quotes.ts` (add `'ขอคิดก่อน'` to `QUOTE_CATEGORIES` before `'เทียบยี่ห้ออื่น'`)
- Test: `tests/topics.test.ts`

**Interfaces:**
- Produces:
  - `export type Topic = Exclude<QuoteCategory, 'อื่นๆ'>`
  - `export const TOPICS: Topic[]` (display order = `QUOTE_CATEGORIES` order without `อื่นๆ`)
  - `export const CANDIDATE_ORDER: Topic[]` (Global Constraints order)
  - `export function topicsOf(text: string): Topic[]`: `[]` for blank or button text, otherwise every matching topic in `TOPICS` order

- [ ] **Step 1: Write failing tests.** `'แพงไปหน่อยค่ะ ลดได้ไหม'` → `['ราคา/แพง']`. `'กินยาเบาหวานอยู่ กินคู่กันได้ไหม'` → `['อาการ/สุขภาพ','กลัวผลข้างเคียง']`. `'ขอคิดดูก่อนนะคะ'` → `['ขอคิดก่อน']`. `'มีรีวิวไหมคะ'` → `['ไม่มั่นใจ/ขอรีวิว']`. `'เคยกินยี่ห้ออื่นมา'` → `['เทียบยี่ห้ออื่น']`. `'เก็บเงินปลายทางได้ไหม'` → `['ส่งของ/จ่ายเงิน']`. `'กินแล้วหลับดีขึ้นมากค่ะ'` → includes `'คำชม'`. The button texts `'ราคา'` and `'สนใจค่ะ'` give `[]`. `'สวัสดีค่ะ'` gives `[]`. Also check that `QUOTE_CATEGORIES` includes `'ขอคิดก่อน'` right before `'เทียบยี่ห้ออื่น'`.
- [ ] **Step 2: Run** `npx vitest run tests/topics.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** with one regex per topic from spec §2. Import `BUTTON_RE` from `src/parse/messages.ts`.
- [ ] **Step 4: Run** `npx vitest run`. Expected: all pass. The `tests/quotes.test.ts` category order test still passes because it reads `QUOTE_CATEGORIES`.
- [ ] **Step 5: Commit** `feat: keyword topics for customer messages` (include spec + plan).

### Task 2: Topics and candidates from message exports, stored per chat

**Files:**
- Modify: `src/parse/types.ts` (`ConvRow.topics: string[]`; `MessagesResult` ok branch adds `candidates: Candidate[]`)
- Modify: `src/parse/messages.ts`
- Modify: `src/data/mappers.ts` (`DbConv.topics`, both mappers), `src/data/read.ts` (`CONV_COLS` adds `topics`)
- Create: `supabase/migrations/0004_topics.sql`
- Test: `tests/messages.test.ts`, plus any test building `ConvRow` literals (`tests/conversations.test.ts`, `tests/leads.test.ts`, `tests/data.test.ts`), which need `topics: []`

**Interfaces:**
- Consumes: `topicsOf`, `CANDIDATE_ORDER`, `Topic` (Task 1), `maskPhones` (`src/metrics/quotes.ts`)
- Produces:
  - `export type Candidate = { conversationId: string; pageId: PageId; day: string; text: string; topic: Topic }` in types.ts
  - `export function pickCandidates(msgs: { conv: string; page: PageId; at: string; text: string }[]): Candidate[]` in messages.ts. `day` = `at.slice(0,10)`.
  - `ConvRow.topics` = the union of `topicsOf` over the chat's messages, in `TOPICS` order

- [ ] **Step 1: Write failing tests** for `pickCandidates`. Assertions: the address+phone sentence from Review Focus 2 is excluded. A 10-char sentence is excluded. An email sentence is excluded. A button is excluded. `'โทรมา 0812345678 ถามว่ากินคู่ยาความดันได้ไหมคะ'` becomes text `'โทรมา [เบอร์] ถามว่ากินคู่ยาความดันได้ไหมคะ'` with topic `'กลัวผลข้างเคียง'` (rarer than `อาการ/สุขภาพ`). Two qualifying messages in one chat give 1 candidate (the earlier one). 40 qualifying chats give 30. A `ขอคิดก่อน` chat sorts before a `ราคา/แพง` chat. An input with no qualifying messages gives `[]`. Also add a `parseMessages` test on a small sheet: a chat whose messages say `'แพงจัง'` and `'ส่งปลายทางได้ไหม'` has `topics` `['ราคา/แพง','ส่งของ/จ่ายเงิน']`.
- [ ] **Step 2: Run** `npx vitest run tests/messages.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Keep the raw text only in the local `Msg` (add `text`), use it for `topics` and `pickCandidates`, and don't copy it into `ConvRow`. Fix the other tests' `ConvRow` literals by adding `topics: []`.
- [ ] **Step 4: Write `0004_topics.sql`:** `alter table conversations add column topics text[] not null default '{}'`. Then `create or replace function save_messages`, copied from the live definition (`select pg_get_functiondef('save_messages(text,text,jsonb)'::regprocedure)`) with `topics` added to the temp table (`array(select jsonb_array_elements_text(coalesce(x.topics,'[]')))`), the recordset type, the insert column list and the `do update set`. Then drop and re-add the `customer_quotes` category check with `'ขอคิดก่อน'`. Re-grant `save_messages(text,text,jsonb)` to anon and authenticated.
- [ ] **Step 5: Apply** the migration with Supabase `apply_migration` (project `dbxjssrswmggkfdlhslc`, name `topics`). This needs the user's pop-up approval; if it expires twice, stop and ask. Verify with `select column_name from information_schema.columns where table_name='conversations' and column_name='topics'` → 1 row.
- [ ] **Step 6: Run** `npx tsc -b && npx vitest run`. Expected: all pass.
- [ ] **Step 7: Commit** `feat: store topics per chat and suggest sentences from message files`

### Task 3: Reasons metrics

**Files:**
- Modify: `src/metrics/leads.ts` (`Lead.topics: string[]`, union over rows)
- Create: `src/metrics/reasons.ts`
- Test: `tests/reasons.test.ts`; `tests/leads.test.ts` (topics union) and `tests/ads.test.ts` lead helper (`topics: []`)

**Interfaces:**
- Consumes: `Lead` (leads.ts), `TOPICS` (Task 1), `stageOf` (conversations.ts)
- Produces (all take already-filtered new leads):
  - `export const BUY_REASON_TAGS: string[]`, `export const LOST_REASON_TAGS: string[]` (Global Constraints lists, in that order)
  - `export const MIN_TOPIC_CHATS = 10`
  - `export function topicCoverage(leads: Lead[]): { withTopics: number; total: number }`
  - `export function topicStats(leads: Lead[]): { avg: number | null; buy: TopicRow[]; notBuy: TopicRow[]; none: number }` where `TopicRow = { topic: Topic; chats: number; closed: number; rate: number; thin: boolean }`. `buy` has `rate ≥ avg`, `notBuy` the rest, each sorted by chats desc. Topics with 0 chats are omitted. `none` = leads with empty topics.
  - `export function reasonTagStats(leads: Lead[]): { buy: ReasonSide; lost: ReasonSide }` where `ReasonSide = { rows: [tag: string, chats: number][]; tagged: number; total: number }`: `buy` over closed leads with `BUY_REASON_TAGS`, `lost` over not-closed leads with `LOST_REASON_TAGS`. Rows include zeros, sorted by chats desc (stable on list order). `tagged` = leads with ≥1 tag of that side.
  - `export function dropStages(leads: Lead[]): [stage: string, chats: number][]`: over lost leads, `stageOf(l.tags)` mapped to the labels พร้อมสั่ง, ลังเล, ขอโปร, ขอราคา, ถามสุขภาพ, สนใจ, ไม่มีแท็กขั้น (for `อื่นๆ`). Fixed order, zeros kept.

- [ ] **Step 1: Write failing tests.** Use 10 leads: 4 with `ราคา/แพง` (1 closed), 3 with `ส่งของ/จ่ายเงิน` (3 closed), 3 with no topics (0 closed). That gives avg 40, buy = [ส่งของ 3/100% thin], notBuy = [ราคา 4/25% thin], none 3. Empty input gives `{avg:null,buy:[],notBuy:[],none:0}`. In `reasonTagStats`, a lost lead with `ติดราคา` and `ไม่สนใจ` counts once in `lost.tagged` and once in each row. A closed lead with `ส่วนผสม` counts in `buy`. A closed lead with `ติดราคา` is not counted in `lost`. In `dropStages`, a lost lead with `['2.ขอราคา']` counts in ขอราคา, one with no stage tag counts in ไม่มีแท็กขั้น, and closed leads are ignored. `topicCoverage` on 2 leads (one with topics) gives `{withTopics:1,total:2}`. `toLeads` unions `topics` across rows.
- [ ] **Step 2: Run** `npx vitest run tests/reasons.test.ts tests/leads.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Rates are rounded to 0.1.
- [ ] **Step 4: Run** `npx vitest run`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: buy/not-buy reason metrics`

### Task 4: Reasons section on the เสียงลูกค้า tab

**Files:**
- Create: `src/ui/Reasons.tsx`
- Modify: `src/ui/Quotes.tsx` (accept `leads: Lead[]`; render `<Reasons>` above the add form, using the page's own period and page filters)
- Modify: `src/ui/App.tsx` (`<Quotes leads={base.leads} />`)

**Interfaces:**
- Consumes: Task 3 functions, `inStart`, `Lead`
- Produces: `export function Reasons({ leads }: { leads: Lead[] })`. `Quotes` passes leads already filtered to `isNew`, the page, and `startDay ≥ from`.

- [ ] **Step 1:** Card "ทำไมลูกค้าซื้อ / ไม่ซื้อ" with three blocks. (a) Two columns, "พูดถึงแล้วมักซื้อ" and "พูดถึงแล้วมักไม่ซื้อ": row = topic · chats · rate% · `ข้อมูลยังน้อย` pill when thin. The header line reads "ค่าเฉลี่ย X% จาก N แชทใหม่ · ไม่พูดถึงหัวข้อไหน M แชท". (b) "เหตุผลที่แอดมินติดแท็ก" in two lists, ซื้อเพราะ and ไม่ซื้อเพราะ, each with "ติดแท็กเหตุผลแล้ว X จาก Y แชท…". Tags with 0 are listed last, muted. (c) "คนที่ไม่ซื้อ เงียบไปที่ขั้นไหน" as a `BarList`. When `topicCoverage` is below total, show a callout "มีหัวข้อ X จาก Y แชท อัปไฟล์ข้อความเก่าซ้ำเพื่อให้ครบ". With 0 leads, show "ยังไม่มีแชทใหม่ในช่วงนี้".
- [ ] **Step 2: Verify** `npx tsc -b && npx vitest run && npm run build`. All succeed.
- [ ] **Step 3: Commit** `feat: reasons section on customer voice tab`

### Task 5: Candidate panel on the Upload screen

**Files:**
- Create: `src/ui/Candidates.tsx`
- Modify: `src/ui/Upload.tsx` (after `save`, collect `candidates` from saved message results into state; render `<Candidates>` under the results)

**Interfaces:**
- Consumes: `Candidate` (Task 2), `addQuote` (`src/data/write.ts`), `QUOTE_CATEGORIES`, `loadCode`
- Produces: `export function Candidates({ items, code }: { items: Candidate[]; code: string })`

- [ ] **Step 1:** Card "ประโยคที่น่าสนใจจากไฟล์ที่เพิ่งอัป (ยังไม่ถูกเก็บ)". The warning reads "ปิดหน้านี้แล้วประโยคที่ไม่ได้กดเก็บจะหายไป ระบบไม่เก็บข้อความลูกค้า". Each row has: quote text · category `<select>` (default = topic) · page name · `thaiDay(day)` · button `เก็บ`. On click, call `addQuote(code, {day,pageId,category,quote:text,note:''})`. Success turns the button into a disabled `เก็บแล้ว`. An error shows the message on that row only. With empty items, show "ไม่มีประโยคที่เข้าหัวข้อในไฟล์นี้". The panel appears only when a message file was saved in this session.
- [ ] **Step 2: Verify** `npx tsc -b && npx vitest run && npm run build`.
- [ ] **Step 3: Commit** `feat: suggest customer sentences after uploading message files`

### Task 6: Ad rank best to worst

**Files:**
- Modify: `src/metrics/ads.ts` (`AdScore.rank: number | null`; `adScores` keeps its return shape and sorts judged ads by rank)
- Modify: `src/ui/Ads.tsx` (`#` column with rank; table order = rank; ข้อมูลยังน้อย stays in `<details>`)
- Test: `tests/ads.test.ts`

**Interfaces:**
- Produces: `AdScore.rank`, 1-based over ads with `chats ≥ MIN_CHATS`, ordered by Wilson lower bound desc, then chats desc. `null` otherwise. `ads` array order: ranked ads by rank, then unranked by chats desc.

- [ ] **Step 1: Write failing tests.** With X 0/21, Y 30/100, W 9/50, and Z 5/5 (thin): ranks Y=1, W=2, X=3, Z=null. Order is Y, W, X, Z. Update the existing sort test to the new order.
- [ ] **Step 2: Run** `npx vitest run tests/ads.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the rank and the `#` column. The verdict pill stays as is.
- [ ] **Step 4: Run** `npx tsc -b && npx vitest run && npm run build`. Expected: pass.
- [ ] **Step 5: Commit** `feat: rank ads best to worst`

### Task 7: Per-admin close rate

**Files:**
- Modify: `src/config/admins.ts` (`export const ADMIN_TAGS: Record<string, string> = { 'พี่ก้อย': 'พี่ก้อย', 'นุ่น🤍': 'นุ่น' }`, `export const NAME_TAG_FROM = '2026-11-04'`)
- Create: `src/metrics/admins.ts`
- Modify: `src/ui/Overview.tsx` (admin sales card)
- Test: `tests/admins.test.ts`

**Interfaces:**
- Produces: `export function adminCloses(leads: Lead[], range: DateRange, page: PageId | 'all'): { admin: string; chats: number; closed: number; rate: number | null }[]`, one row per `ADMIN_TAGS` value in order. It covers all leads (not only new ones) with the name tag, `startDay ≥ NAME_TAG_FROM` and in range, on the page.

- [ ] **Step 1: Write failing tests.** A lead with both names counts for both. A lead from 2026-11-03 is ignored. A lead from another page with `page = FB` is ignored. Zero chats gives `rate: null`. A closed lead counts in `closed`.
- [ ] **Step 2: Run** `npx vitest run tests/admins.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, then add to each admin row of the card: `แชทที่ดูแล N · ปิดได้ C (R%)`, matched by nickname to `os.admins` names. Admins with orders but no tag row show orders only. Add the note "อัตราปิดนับจากแท็กชื่อแอดมิน ตั้งแต่ 4 พ.ย.".
- [ ] **Step 4: Run** `npx tsc -b && npx vitest run && npm run build`. Expected: pass.
- [ ] **Step 5: Commit** `feat: close rate per admin from name tags`

### Task 8: Small fixes (spec §8.2, §8.3)

**Files:**
- Modify: `src/metrics/daily.ts` (sources clamp at 0), `src/ui/App.tsx` (range restore + rows keyed by range)
- Create: `.gitattributes`
- Test: `tests/daily.test.ts`

- [ ] **Step 1: Write a failing test:** tag rows with `'9.อื่นๆ .(ทักมั่ว)': -9` give `sources` entry `['อื่นๆ (ทักมั่ว)', 0]`. Run it and see it FAIL. Implement `Math.max(0, …)`. Run it and see it PASS.
- [ ] **Step 2:** App: keep `autoRange: RangeKey | null`. Entering ads from `day` sets `30d` and remembers `day`. Leaving ads restores it unless the user picked a range meanwhile (`pickRange` clears it). Store `loadedKey = from|to` with the range data and render the skeleton while it doesn't match the current range.
- [ ] **Step 3:** `.gitattributes` holds `* text=auto eol=lf`. Run `git add --renormalize .` and confirm `git diff --cached --ignore-all-space --stat` shows only `.gitattributes`.
- [ ] **Step 4: Run** `npx tsc -b && npx vitest run && npm run build`. Expected: pass.
- [ ] **Step 5: Commit** the line-ending change alone as `chore: normalize line endings to LF`, then the rest as `fix: clamp negative sources, restore range after ads tab, no stale frame`.

### Task 9: Real-data check and browser check

**Files:**
- Create: `scripts/check-topics.ts` (parses the local `../EXPORT_MESSAGE_*.xlsx` with `parseMessages` and prints topic counts and the candidate count per file. For each candidate, print only `topic` and `text.length`, never the text.)

- [ ] **Step 1: Run** `npx tsx scripts/check-topics.ts`. Expected: topic chat counts in the same order of size as spec §2 (ราคา drops once buttons are excluded), ≤ 30 candidates per file, and a script-side assertion that no candidate matches the address regex.
- [ ] **Step 2:** Run the dev server and check in Chrome: เสียงลูกค้า shows the reasons card with the coverage callout, the โฆษณา table shows `#` ranks with 120250983982390 at #1, the admin card shows per-admin close rates, and the upload screen renders. Don't upload real files from the browser.
- [ ] **Step 3: Commit** `chore: real-data check for topics and candidates`. Ask the user before merging to `main` and pushing.
