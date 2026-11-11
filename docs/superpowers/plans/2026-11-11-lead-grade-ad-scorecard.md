# เกรดลีด + คะแนนโฆษณา Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grade every new chat A/B/C/D from how the customer talks, and score each ad tag "ดี / ไม่ดี / กลางๆ / ข้อมูลยังน้อย" so marketing can decide which ads to keep or cut.

**Architecture:** Two pure metric modules (`leads.ts` merges a chat's daily export rows into one `Lead` and grades it; `ads.ts` scores ad tags from leads with a Wilson interval). The browser computes everything from the existing `conversations` table. There's no DB change. The UI adds a lead-grade card on Overview, a new "โฆษณา" tab, and grade badges on the follow list.

**Tech Stack:** React 18 + TypeScript + Vite, Vitest, Supabase JS (read-only here), tsx for the real-data script.

**Spec:** `docs/superpowers/specs/2026-11-11-lead-grade-ad-scorecard-design.md`

## Global Constraints

- No DB migration, no upload change, and no customer name/phone/text stored or displayed beyond what is already there.
- Close tags = `isCloseTag` from `src/grouping/rules.ts` (`ปิด`, `ปิดAds`, `ปิดOrganic`).
- Ad tag = `/^\d{12,}$/` (same rule as `groupOf`). A tag shorter than 15 digits is flagged "เลขอาจไม่ครบ".
- Grades use conversation behaviour only. Close tags, `hasPhone`, `ปลายทาง` and `โอน` never decide a grade.
- Grade order A > D > B > C (the first that matches wins):
  - A: any tag starting `5.`, or `msgs ≥ 4`, or `days ≥ 2`
  - D: `ไม่สนใจ`, or any tag starting `9.`, or `ทักซ้ำไม่ซื้อ`
  - B: any tag starting `3.` or `4.`, or (`typedFirst` and `msgs ≥ 2`)
  - C: everything else
- `typedFirst` = the first row's `firstKind !== 'button'` (media counts as typed).
- New chat = the earliest row carries its own date tag (`isDateTagOf(tag, row.day)`) and no row has `8.ลูกค้าเก่า`. `startDay` = day of the earliest row.
- Ad verdict: `MIN_CHATS = 15`, Wilson z = 1.645. `avg` = closed ÷ distinct new chats that have ≥1 ad tag (not a sum over ads). Lower bound > avg means ดี, upper < avg means ไม่ดี, otherwise กลางๆ.
- Ads tab default range is 30 days.
- UI copy is Thai and follows the existing tone. Use existing classes (`card`, `kpi`, `fcard`, `chip`, `table-wrap`, `callout`, `tag-pill`, `small`, `desc`).

## Review Focus

1. No new chat with an ad tag in range (e.g. IG page, or one day before 30/10): `avg` is `null`, every ad gets ข้อมูลยังน้อย, and the page shows an empty state, never `NaN%`. Test in Task 2.
2. Page filter: `avg` and every ad's numbers come only from leads on the selected page. An ad seen on two pages shows only that page's chats. Test in Task 2.
3. A tag present in an earlier export and gone in a later one still counts, both for the grade and for the ad. Lead tags are the union over rows. Test in Task 1.
4. A chat that started before the range but has rows inside it isn't a lead of this range. A chat that started inside the range keeps rows after `range.to`. Test in Task 1. Task 3 loads rows from `range.from` to latest.
5. A follow-list chat whose other rows aren't loaded still gets a grade from the rows it has, and never crashes on a missing lead. Test in Task 5.

---

### Task 1: Leads and grades (`src/metrics/leads.ts`)

**Files:**
- Create: `src/metrics/leads.ts`
- Modify: `src/grouping/rules.ts` (export `isAdTag`; make `groupOf` use it)
- Test: `tests/leads.test.ts`

**Interfaces:**
- Consumes: `ConvRow` (`src/parse/types.ts`), `isCloseTag`, `isDateTagOf` (`src/grouping/rules.ts`)
- Produces:
  - `export const isAdTag: (t: string) => boolean` in rules.ts
  - `export type Grade = 'A' | 'B' | 'C' | 'D'`
  - `export const GRADES: { grade: Grade; label: string; hint: string }[]`: labels `A ร้อน`, `B อุ่น`, `C เย็น`, `D ไม่ใช่ลีด`. Hints are the plain-Thai rule from Global Constraints.
  - `export type Lead = { conversationId: string; pageId: PageId; startDay: string; lastDay: string; isNew: boolean; tags: string[]; msgs: number; days: number; phone: boolean; typedFirst: boolean; closed: boolean; ads: string[] }`
  - `export function toLeads(rows: ConvRow[]): Lead[]`
  - `export function gradeOf(l: Pick<Lead, 'tags' | 'msgs' | 'days' | 'typedFirst'>): Grade`
  - `export function gradeStats(leads: Lead[]): { grade: Grade; chats: number; closed: number; rate: number | null }[]` (always 4 rows in A,B,C,D order; rate rounded to 0.1 %, null when chats = 0)
  - `export const inStart = (r: DateRange) => (l: Lead) => boolean` (`startDay` within range)

- [ ] **Step 1: Write the failing tests** in `tests/leads.test.ts`. Reuse the `conv()` helper shape from `tests/conversations.test.ts`.
  - `gradeOf`: `{tags:['5.พร้อมสั่ง','ไม่สนใจ'],msgs:1,days:1,typedFirst:false}` → `'A'`; `{tags:['ไม่สนใจ','3. ขอโปรโมชั่น'],msgs:1,days:1,typedFirst:true}` → `'D'`; `{tags:[],msgs:4,days:1,typedFirst:false}` → `'A'`; `{tags:[],msgs:1,days:2,typedFirst:false}` → `'A'`; `{tags:['4.ถามสุขภาพ'],msgs:1,days:1,typedFirst:false}` → `'B'`; `{tags:[],msgs:2,days:1,typedFirst:true}` → `'B'`; `{tags:[],msgs:2,days:1,typedFirst:false}` → `'C'`; `{tags:['ปิดAds','ปลายทาง'],msgs:1,days:1,typedFirst:false}` → `'C'` (outcomes never grade); `{tags:['9.อื่นๆ .(ทักมั่ว)'],msgs:1,days:1,typedFirst:true}` → `'D'`.
  - `toLeads` merges: rows for chat `a` on 2026-11-01 (`['1/11','120250984880940']`, msgCount 1, firstKind `'button'`) and 2026-11-02 (`['1/11','ปิดAds']`, msgCount 3, hasPhone true) give one lead with `startDay '2026-11-01'`, `lastDay '2026-11-02'`, `isNew true`, `msgs 4`, `days 2`, `phone true`, `typedFirst false`, `closed true`, `ads ['120250984880940']`, and both tags kept.
  - `isNew` false when the earliest row lacks its own date tag (`['31/10']` on 2026-11-01), and false when any row has `8.ลูกค้าเก่า`.
  - `inStart({from:'2026-11-02',to:'2026-11-02'})` keeps a lead with startDay 11-02 and drops startDay 11-01.
  - `gradeStats` on 3 leads (2 A with 1 closed, 1 C) → `[{A,2,1,50},{B,0,0,null},{C,1,0,0},{D,0,0,null}]`.

- [ ] **Step 2: Run** `npx vitest run tests/leads.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `leads.ts` and `isAdTag`. Group rows by `conversationId` and sort each group by `day`. `msgs` = sum of `msgCount`, `days` = distinct `day` count, `tags` = union in first-seen order, `ads` = `tags.filter(isAdTag)`.

- [ ] **Step 4: Run** `npx vitest run`. Expected: all pass (existing 91 + new).

- [ ] **Step 5: Commit** `feat: grade chats A/B/C/D from conversation behaviour` (include the spec and this plan in the commit).

### Task 2: Ad scores (`src/metrics/ads.ts`)

**Files:**
- Create: `src/metrics/ads.ts`
- Test: `tests/ads.test.ts`

**Interfaces:**
- Consumes: `Lead`, `gradeOf` (Task 1), `PageId`
- Produces:
  - `export const MIN_CHATS = 15`
  - `export function wilson(k: number, n: number, z = 1.645): [lo: number, hi: number]` (clamped to [0,1]; n = 0 → `[0, 1]`)
  - `export type Verdict = 'ดี' | 'ไม่ดี' | 'กลางๆ' | 'ข้อมูลยังน้อย'`
  - `export type AdScore = { tag: string; name: string | null; chats: number; good: number; closed: number; rate: number; verdict: Verdict; pages: PageId[]; firstDay: string; lastDay: string; shortId: boolean }` (`good` = A+B leads, `rate` in % rounded to 0.1)
  - `export function adScores(leads: Lead[], adNames: Record<string, string>, page: PageId | 'all'): { avg: number | null; adChats: number; ads: AdScore[] }`. It uses only `isNew` leads on `page`. Sort by verdict order ดี, ไม่ดี, กลางๆ, ข้อมูลยังน้อย, then `chats` desc. `avg` is in % (0.1).

- [ ] **Step 1: Write the failing tests**
  - `wilson(0, 21)` ≈ `[0, 0.114]` and `wilson(8, 111)` ≈ `[0.041, 0.123]` (`toBeCloseTo(x, 3)`). `wilson(0, 0)` → `[0, 1]`.
  - Build leads with a helper: 21 new leads with ad X, 0 closed. 100 new leads with ad Y, 30 closed. 5 with ad Z, 5 closed. Then `avg` = 35/126 → `27.8`, X → ไม่ดี, Y → กลางๆ, Z → ข้อมูลยังน้อย, and the sorted order is X, Y, Z.
  - A lead carrying two ad tags counts once in `adChats` and once for each ad.
  - Page filter: the same ad on two pages with `page = FB` counts only FB leads, and `pages` = `[FB]`.
  - Empty: no new lead with an ad tag gives `{ avg: null, adChats: 0, ads: [] }`. With `avg` null, a lead set whose ads are all ≥ 15 chats is still ข้อมูลยังน้อย (can't happen with real data, but must not throw).
  - `shortId` true for `'1252805530361'`, false for `'120250984880940'`. `name` from `adNames` or null.
  - Old-customer leads (`isNew false`) are ignored.

- [ ] **Step 2: Run** `npx vitest run tests/ads.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** `ads.ts` as specified. Use the Wilson score interval: `(p + z²/2n ± z√(p(1−p)/n + z²/4n²)) / (1 + z²/n)`.

- [ ] **Step 4: Run** `npx vitest run`. Expected: all pass.

- [ ] **Step 5: Commit** `feat: score ad tags against the average close rate`

### Task 3: Load leads and the Overview grade card

**Files:**
- Modify: `src/data/read.ts` (add `fetchConvsFrom`, `fetchConvsByIds`)
- Modify: `src/ui/App.tsx` (load lead rows; pass `leads` to Overview)
- Modify: `src/ui/Overview.tsx` (new card "เกรดลีด" after the KPI grid)

**Interfaces:**
- Consumes: `toLeads`, `gradeStats`, `inStart`, `GRADES` (Task 1)
- Produces:
  - `export async function fetchConvsFrom(from: string): Promise<ConvRow[]>`: all rows with `day >= from`, using the same `all()` paging and `CONV_COLS`
  - `export async function fetchConvsByIds(ids: string[]): Promise<ConvRow[]>`: `.in('conversation_id', chunk)` in chunks of 200, merged
  - App state `leads: Lead[]` = `toLeads(await fetchConvsFrom(range.from))`, loaded alongside the existing range fetch. It's reused by Task 4.

- [ ] **Step 1:** Add both read functions and the App loading. Overview gets the prop `leads: Lead[]` and filters `leads.filter(inStart(range)).filter(l => l.isNew && (page === 'all' || l.pageId === page))`.
- [ ] **Step 2:** Card "เกรดลีด": one `fcard`-style tile per grade (label, chat count, % of new chats, "ปิดได้ X%"), a one-line hint per grade from `GRADES`, and the caveat line from spec §3 ("A มีคนที่กำลังซื้อปนอยู่… ไม่ใช่การทำนายล่วงหน้า"). With 0 new chats, show "ยังไม่มีไฟล์ข้อความของช่วงนี้".
- [ ] **Step 3: Verify** `npx tsc -b && npx vitest run && npm run build`. All succeed.
- [ ] **Step 4: Verify in the browser** with `npm run dev`: Overview with range 30 วัน, ทุกเพจ shows four grade tiles with A's close rate highest. Switching the page filter changes the counts.
- [ ] **Step 5: Commit** `feat: lead grade card on overview`

### Task 4: Ads tab

**Files:**
- Create: `src/ui/Ads.tsx`
- Modify: `src/ui/Sidebar.tsx` (tab `'ads'`, title `โฆษณา`, icon, placed after `follow`)
- Modify: `src/ui/App.tsx` (render `<Ads>`; show `FilterBar` on `overview` and `ads`; when switching to `ads` while `rangeKey === 'day'`, set `'30d'`)

**Interfaces:**
- Consumes: `adScores`, `MIN_CHATS`, `AdScore` (Task 2), `leads` state (Task 3), `adNames` (already in `base`)
- Produces: `export function Ads({ leads, range, page, adNames, goTags }: { leads: Lead[]; range: DateRange; page: PageId | 'all'; adNames: Record<string, string>; goTags: () => void })`

- [ ] **Step 1:** Summary row: four tiles (ดี / ไม่ดี / กลางๆ / ข้อมูลยังน้อย) with counts. Under them, "ค่าเฉลี่ยโฆษณา X% จาก N แชทใหม่ที่มีแท็กโฆษณา".
- [ ] **Step 2:** Table, rows ordered as returned. Columns: โฆษณา (name · tag, or `แอด <tag>`, with an `เลขอาจไม่ครบ` pill when `shortId`), แชทใหม่, ลีด A+B (%), ปิด, อัตราปิด, คำตัดสิน (pill colored: ดี `ACCENT`, ไม่ดี `CRIT`, others neutral), เพจ, เห็นช่วง (`thaiDay(firstDay)–thaiDay(lastDay)`). Under the verdict, the reason sentence `${chats} แชท ปิดได้ ${closed} · ค่าเฉลี่ย ${avg}%`, plus `· สูงกว่าค่าเฉลี่ยแบบที่ไม่น่าใช่ความบังเอิญ` for ดี, `· ต่ำกว่าค่าเฉลี่ยแบบที่ไม่น่าใช่ความบังเอิญ` for ไม่ดี, and `· ต้องมีอย่างน้อย ${MIN_CHATS} แชทถึงจะตัดสิน` for ข้อมูลยังน้อย. Rows that are ข้อมูลยังน้อย sit in a collapsed `<details>` "อีก N ตัวที่ข้อมูลยังน้อย".
- [ ] **Step 3:** Callout with the three warnings from spec §4 (usable from 30/10 · tagging is selective, so compare ads with each other · no spend data yet). Add a `btn-ghost` "ตั้งชื่อโฆษณา" → `goTags`. Empty state when `ads` is empty: "ยังไม่มีแชทใหม่ที่ติดแท็กโฆษณาในช่วงนี้".
- [ ] **Step 4: Verify** `npx tsc -b && npx vitest run && npm run build`, then in `npm run dev`: the Ads tab opens on 30 วัน, the table renders, and the page filter changes the numbers.
- [ ] **Step 5: Commit** `feat: ads tab with keep/cut verdicts`

### Task 5: Grade badges on the follow list

**Files:**
- Modify: `src/metrics/conversations.ts` (`FollowItem` gets `grade: Grade`; `followList(convs, grades?)`)
- Modify: `src/ui/App.tsx` (after `base` loads, `fetchConvsByIds(latestConvs ids)` → `toLeads` → `Map<id, Grade>`)
- Modify: `src/ui/Follow.tsx` (grade pill before the stage; filter cards unchanged)
- Test: `tests/conversations.test.ts`

**Interfaces:**
- Consumes: `toLeads`, `gradeOf`, `Grade` (Task 1), `fetchConvsByIds` (Task 3)
- Produces: `export function followList(convs: ConvRow[], grades: Map<string, Grade> = new Map()): FollowItem[]`. A missing id falls back to `gradeOf` on that row (`msgs = msgCount`, `days = 1`, `typedFirst = firstKind !== 'button'`). Sort: grade A, B, C, D first, then the existing order.

- [ ] **Step 1: Write the failing tests:** two follow-eligible rows (`5.พร้อมสั่ง`/`ไม่เปิดอ่าน` and `2.ขอราคา`/`อ่านไม่ตอบ`) with `grades` mapping the second to `'A'` and the first to `'C'` come out with the second first. With `followList(convs)` (no map), the grade comes from the row and the result doesn't throw.
- [ ] **Step 2: Run** `npx vitest run tests/conversations.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the above and the badge (A `#FCE6DA`/`#8A2E07`, B `#F7E7C6`/`#5C3A06`, C/D neutral `#EDF2EF`/`#55665D`).
- [ ] **Step 4: Run** `npx tsc -b && npx vitest run && npm run build`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: lead grade on follow list`

### Task 6: Real-data check and release

**Files:**
- Create: `scripts/check-leads.ts` (reads `.env.local`, pulls `conversations` with the anon key, prints totals only and no customer fields)

- [ ] **Step 1:** The script runs `toLeads` on all rows, then `gradeStats` on new leads with `startDay` 2026-10-29..2026-11-10, and `adScores(…, {}, 'all')` for the same range.
- [ ] **Step 2: Run** `npx tsx scripts/check-leads.ts`. Expected (data up to 10/11): A 176 / 41.5 %, B 90 / 7.8 %, C 371 / 2.2 %, D 86 / 0 %; avg 13.8; 120250984880940 → 111 แชท ไม่ดี; 120250983524320 → 21 แชท ไม่ดี; 120250983982390 → 47 กลางๆ; 120251252805530 → 18 กลางๆ. If later uploads changed the data, the order A > B > C ≥ D and the two ไม่ดี verdicts must still hold. Explain any other drift before release.
- [ ] **Step 3: Commit** `chore: real-data check for lead grades and ad scores`, then `git push origin main` (deploys GitHub Pages). Confirm with `gh run list --limit 1` → success.
