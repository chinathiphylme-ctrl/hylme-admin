# Tag Completeness Check on Upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After message files are saved, the upload screen shows, per day, how many chats have complete tags under the four rules, per admin, with a list of incomplete chats linking to Pancake.

**Architecture:** A pure function module `src/metrics/tagCheck.ts` checks each `ConvRow`'s tags and groups results per day. `src/ui/TagCheckCard.tsx` renders them. `Upload.tsx` keeps the saved message files' `convs` in state and renders the card under the save results. No Supabase reads or writes are added.

**Tech Stack:** React 18 + TypeScript + Vite, vitest.

**Spec:** `docs/superpowers/specs/2026-11-27-tag-completeness-check-design.md`

## Global Constraints

- Rules: (1) admin name `พี่ก้อย` / `นุ่น🤍` on every chat; (2) open chat needs a 1.–10. tag (`numberOf(tags) !== 0`); (3) closed chat (`isCloseTag`) needs a `BUY_REASON_TAGS` tag, and a `ปิดAds` or `ปิดOrganic` (plain `ปิด` alone is flagged); (4) open chat with `อ่านไม่ตอบ` / `ไม่เปิดอ่าน` / `ทักซ้ำไม่ซื้อ` needs a `LOST_REASON_TAGS` tag.
- Neutral numbers only — no ดี/แย่/ควร wording about admins.
- No customer names, phones or message text on screen.
- No new Supabase calls; compute from the parsed `convs` already in the browser.
- Tags compared after `.trim()`.
- UI copy in Thai, matching `NoStageCard` styling (`card`, `table-wrap`, `details`, `btn-ghost`, `small`, `desc`).

## Review Focus

- Tags with surrounding spaces (`' ปิดAds '`, `' พี่ก้อย'`) must count as the tag — test in Task 2.
- A chat carrying both admin names counts under both admins — test in Task 2.
- A closed chat that also has a silent tag is not checked for rule 4 — test in Task 2.
- `ปิด` together with `ปิดAds` is not flagged as plain close — test in Task 2.
- A message file whose save failed must not appear in the card — Task 3 step builds `checked` only from files with an ok result.

---

### Task 1: Commit the pending 1.–10. stage rows

The working tree already holds `numberOf` and the 1.–10. matrix (uncommitted). Rule 2 depends on it.

**Files:** `src/metrics/conversations.ts`, `src/ui/NoStageCard.tsx`, `src/ui/Overview.tsx`, `tests/conversations.test.ts` (already modified)

- [ ] **Step 1:** Create branch: `git switch -c feat/tag-check`
- [ ] **Step 2:** Run `npx vitest run` — expected: 32 files, all pass.
- [ ] **Step 3:** Commit those four files plus the spec and this plan:

```bash
git add src/metrics/conversations.ts src/ui/NoStageCard.tsx src/ui/Overview.tsx tests/conversations.test.ts docs/superpowers/specs/2026-11-27-tag-completeness-check-design.md docs/superpowers/plans/2026-11-27-tag-completeness-check.md
git commit -m "feat(overview): stage rows 1.-10., one row per chat; docs: tag completeness check"
```

### Task 2: `tagCheck.ts` — rules and per-day summary

**Files:**
- Create: `src/metrics/tagCheck.ts`
- Test: `tests/tagCheck.test.ts`

**Interfaces:**
- Consumes: `numberOf(tags: string[]): number | null` from `src/metrics/conversations.ts`; `isCloseTag`, `BUY_REASON_TAGS`, `LOST_REASON_TAGS` from `src/grouping/rules.ts`; `ADMIN_TAGS` from `src/config/admins.ts`; `ConvRow` from `src/parse/types.ts`.
- Produces:

```ts
export type Missing = 'admin' | 'stage' | 'buyReason' | 'plainClose' | 'lostReason'
export const MISSING: Missing[]  // display order: admin, stage, buyReason, plainClose, lostReason
export const MISSING_LABEL: Record<Missing, string>
//   admin 'ไม่มีชื่อแอดมิน', stage 'ยังไม่ปิด ไม่มีแท็กขั้น 1.–10.', buyReason 'ปิดแล้ว ไม่มีเหตุผลที่ซื้อ',
//   plainClose 'ปิดด้วย "ปิด" เฉยๆ ไม่แยก Ads/Organic', lostReason 'ลูกค้าเงียบ ไม่มีเหตุผลที่ไม่ซื้อ'
export const NO_NAME = 'ไม่มีชื่อ'
export function missingOf(tags: string[]): Missing[]       // in MISSING order
export function appliesTo(tags: string[]): Missing[]       // rules that apply to this chat, in MISSING order
export type DayCheck = {
  day: string
  pageIds: PageId[]                                         // distinct, in first-seen order
  total: number
  complete: number
  counts: Record<Missing, { missing: number; of: number }> // of = chats the rule applies to
  byAdmin: { admin: string; incomplete: number; of: number }[] // 'พี่ก้อย', 'นุ่น', then NO_NAME; rows with of = 0 dropped
  incomplete: { conv: ConvRow; missing: Missing[] }[]      // newest lastAt first
}
export function checkByDay(convs: ConvRow[]): DayCheck[]   // one per day, newest day first
```

Applies: `admin` always; `stage` when open; `buyReason` and `plainClose` when closed; `lostReason` when open and silent. Admin nickname comes from `ADMIN_TAGS` values.

- [ ] **Step 1: Write the failing tests** (reuse the `conv()` helper shape from `tests/conversations.test.ts`)

```ts
describe('missingOf', () => {
  it('complete chats pass', () => {
    expect(missingOf(['พี่ก้อย', '2.ขอราคา'])).toEqual([])
    expect(missingOf(['นุ่น🤍', 'ปิดAds', 'ส่วนผสม'])).toEqual([])
    expect(missingOf(['นุ่น🤍', '1.สนใจ', 'อ่านไม่ตอบ', 'ราคาแพง'])).toEqual([])
  })
  it('flags each rule', () => {
    expect(missingOf(['2.ขอราคา'])).toEqual(['admin'])
    expect(missingOf(['พี่ก้อย', 'มะกอก'])).toEqual(['stage'])
    expect(missingOf(['พี่ก้อย', 'ปิด'])).toEqual(['buyReason', 'plainClose'])
    expect(missingOf(['พี่ก้อย', '6.ลังเล', 'ไม่เปิดอ่าน'])).toEqual(['lostReason'])
    expect(missingOf([])).toEqual(['admin', 'stage'])
  })
  it('trims tags', () => {
    expect(missingOf([' พี่ก้อย', ' ปิดAds ', 'ส่วนผสม '])).toEqual([])
  })
  it('closed chat skips stage and silent rules', () => {
    expect(missingOf(['พี่ก้อย', 'ปิดOrganic', 'อ่านไม่ตอบ', 'เคยใช้และพอใจ'])).toEqual([])
  })
  it('plain ปิด next to ปิดAds is not flagged', () => {
    expect(missingOf(['พี่ก้อย', 'ปิด', 'ปิดAds', 'โปรโมชั่น'])).toEqual([])
  })
})

describe('checkByDay', () => {
  it('groups per day newest first, counts rules, admins and incomplete chats', () => {
    const r = checkByDay([
      conv(['พี่ก้อย', '2.ขอราคา'], { day: '2026-11-26' }),
      conv(['พี่ก้อย', 'นุ่น🤍', 'ปิด'], { day: '2026-11-26', conversationId: 'x', lastAt: '2026-11-26T09:00:00+07:00' }),
      conv(['อ่านไม่ตอบ'], { day: '2026-11-26', conversationId: 'y', lastAt: '2026-11-26T15:00:00+07:00' }),
      conv(['นุ่น🤍', '1.สนใจ'], { day: '2026-11-25' }),
    ])
    expect(r.map(d => d.day)).toEqual(['2026-11-26', '2026-11-25'])
    const d = r[0]
    expect([d.total, d.complete]).toEqual([3, 1])
    expect(d.counts.admin).toEqual({ missing: 1, of: 3 })
    expect(d.counts.stage).toEqual({ missing: 1, of: 2 })
    expect(d.counts.buyReason).toEqual({ missing: 1, of: 1 })
    expect(d.counts.plainClose).toEqual({ missing: 1, of: 1 })
    expect(d.counts.lostReason).toEqual({ missing: 1, of: 1 })
    expect(d.byAdmin).toEqual([
      { admin: 'พี่ก้อย', incomplete: 1, of: 2 }, { admin: 'นุ่น', incomplete: 1, of: 1 }, { admin: 'ไม่มีชื่อ', incomplete: 1, of: 1 }])
    expect(d.incomplete.map(i => i.conv.conversationId)).toEqual(['y', 'x'])
    expect(r[1].byAdmin).toEqual([{ admin: 'นุ่น', incomplete: 0, of: 1 }])
  })
})
```

- [ ] **Step 2:** Run `npx vitest run tests/tagCheck.test.ts` — expected: FAIL, cannot resolve `../src/metrics/tagCheck`.
- [ ] **Step 3:** Implement the module with the interfaces above.
- [ ] **Step 4:** Run `npx vitest run` — expected: all files pass.
- [ ] **Step 5:** Commit: `git add src/metrics/tagCheck.ts tests/tagCheck.test.ts && git commit -m "feat(tag-check): rules for complete tags and a per-day summary"`

### Task 3: Card on the upload screen

**Files:**
- Create: `src/ui/TagCheckCard.tsx`
- Modify: `src/ui/Upload.tsx` (state + `save()` + render under `results`)

**Interfaces:**
- Consumes: `checkByDay`, `MISSING`, `MISSING_LABEL`, `DayCheck` from Task 2; `pageName` (`src/config/pages`); `fmt`, `thaiDay` (`src/ui/viewModel`).
- Produces: `export function TagCheckCard({ convs }: { convs: ConvRow[] }): JSX.Element | null` (null when `convs` is empty).

Layout per `DayCheck` (first one in an open `<details open>`, the rest closed):
- Summary line: `ตรวจแท็ก · {thaiDay(day)} · {page names joined ', ' or '4 เพจ'} · {total} แชท · ครบ {complete} แชท`
- Table "ข้อที่ขาด | แชท": one row per `MISSING` with `of > 0`; `admin` and `stage` show the count, `buyReason`, `plainClose`, `lostReason` show `"{missing} จาก {of}"`.
- Table "แอดมิน | ยังไม่ครบ | จากแชท" from `byAdmin`.
- Nested `<details>` "ดูแชทที่ยังไม่ครบ {n} แชท เพื่อเปิดใน Pancake": columns เพจ · ข้อที่ขาด (labels joined ', ') · ทักล่าสุด (`thaiDay(day) HH:MM` from `lastAt.slice(11,16)`) · `เปิดใน Pancake` link (same markup as `NoStageCard`'s `ChatList`).
- Footer `<p className="small">`: `แชทหนึ่งขาดได้หลายข้อ · แชทที่มีสองชื่อนับให้ทั้งสองคน · แท็กปิดอาจค้างจากการซื้อครั้งก่อน (ไฟล์ไม่บอกว่าติดแท็กเมื่อไหร่)`

Upload wiring:
- `const [checked, setChecked] = useState<ConvRow[]>([])`
- In `save()`: `setChecked([])` at the start; after the loop, `setChecked(ready.flatMap(p => 'convs' in p && out.some(o => o.ok && o.fileName === p.fileName) ? p.convs : []))`.
- Render `<TagCheckCard convs={checked} />` right after the `results.map(...)` line, inside the upload `<section>`.

- [ ] **Step 1:** Write `TagCheckCard.tsx` and wire `Upload.tsx` as above.
- [ ] **Step 2:** Run `npm run build` — expected: tsc and vite finish with no errors.
- [ ] **Step 3:** Real-data check: write a throwaway script in the scratchpad that reads `../EXPORT_MESSAGE_1793764421956.xlsx` with `readWorkbook` + `parseMessages`, runs `checkByDay`, and prints `day, total, complete, counts` — expected: numbers print, `total` equals the parsed chat count, and `complete + incomplete.length === total`.
- [ ] **Step 4:** Run `npx vitest run` — expected: all pass.
- [ ] **Step 5:** Commit: `git add src/ui/TagCheckCard.tsx src/ui/Upload.tsx && git commit -m "feat(upload): show the tag check for saved message files"`

### Task 4: Hand-off

- [ ] **Step 1:** Report to the owner: what the card shows, the real-file numbers from Task 3 Step 3, and that it isn't deployed yet. Ask before merging to `main` and pushing (pushing deploys to GitHub Pages).
