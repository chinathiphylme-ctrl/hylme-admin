# Follow-up Rounds per Day — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The follow-up report shows, per day in the chosen range, how many follow-ups were saved for each round 1–7.

**Architecture:** `report()` in `src/followup/report.ts` also returns `byDay`, built from the same filtered, in-range `round` events it already counts. `Report.tsx` renders it as a table card under the per-admin table.

**Tech Stack:** React 18 + TypeScript, vitest.

**Spec:** `docs/superpowers/specs/2026-11-28-followup-rounds-per-day-design.md`

## Global Constraints

- Uses the report's existing filters (range, ownerId, pageId, product); owner = lead owner.
- Day = Bangkok day the event was saved (`eventDay`).
- Counts every `kind === 'round'` event, including ones the sync wrote from Pancake tags (`by === null`).
- `sum(byDay[].total)` must equal the report's `followups`.
- Zero cells render as "–". Neutral numbers, no verdict words.
- No database or fetch changes.

## Review Focus

- A round event at 23:30 Bangkok on the last day of the range must land on that day, not the next — test in Task 1.
- A round event with `roundNo` null or outside 1–7 still counts in `total` (so totals match `followups`) — test in Task 1.
- Owner filter must apply to `byDay` — test in Task 1.

---

### Task 1: `byDay` in `report()` and the card

**Files:**
- Modify: `src/followup/report.ts` (inside `report()`), `src/ui/followup/Report.tsx`
- Test: `tests/followup-report.test.ts`

**Interfaces:**
- Produces: `export type DayRounds = { day: string; rounds: number[]; total: number }` (`rounds.length === 7`, index 0 = round 1) and `report(...).byDay: DayRounds[]`, newest day first, only days with `total > 0`.

- [ ] **Step 1: Write the failing test** (new `describe('rounds per day')` using the file's `lead`, `ev`, `staff`, `all` helpers)

```ts
it('counts round events per Bangkok day and round, newest first, matching followups', () => {
  const leads = [lead('a'), lead('b', { ownerId: 'u2' })]
  const events = [
    ev('a', '2026-11-10T02:00:00Z', { roundNo: 1 }),
    ev('a', '2026-11-10T03:00:00Z', { roundNo: 5 }),
    ev('b', '2026-11-10T04:00:00Z', { roundNo: 5, by: null }),
    ev('b', '2026-11-30T16:30:00Z', { roundNo: 7 }),          // 23:30 Bangkok 30 Nov
    ev('a', '2026-11-11T02:00:00Z', { roundNo: null }),       // counts in total only
    ev('a', '2026-11-11T05:00:00Z', { kind: 'skip', result: null }),
  ]
  const r = report({ leads, events, links: [], orders: [], staff, today: '2026-11-30' }, all)
  expect(r.byDay).toEqual([
    { day: '2026-11-30', rounds: [0, 0, 0, 0, 0, 0, 1], total: 1 },
    { day: '2026-11-11', rounds: [0, 0, 0, 0, 0, 0, 0], total: 1 },
    { day: '2026-11-10', rounds: [1, 0, 0, 0, 2, 0, 0], total: 3 },
  ])
  expect(r.byDay.reduce((s, d) => s + d.total, 0)).toBe(r.followups)
  const u2 = report({ leads, events, links: [], orders: [], staff, today: '2026-11-30' }, { ...all, ownerId: 'u2' })
  expect(u2.byDay.map(d => [d.day, d.total])).toEqual([['2026-11-30', 1], ['2026-11-10', 1]])
})
```

- [ ] **Step 2:** Run `npx vitest run tests/followup-report.test.ts` — expected: FAIL (`byDay` undefined).
- [ ] **Step 3:** In `report()`, accumulate a `Map<day, DayRounds>` from each lead's `ranged` round events (`eventDay(e)`; `roundNo` 1–7 adds to `rounds[roundNo-1]`; always `total++`), return it sorted by day descending as `byDay`.
- [ ] **Step 4:** Run `npx vitest run` — expected: all pass.
- [ ] **Step 5:** In `Report.tsx` add a `<section className="card">` after the per-admin section: `<h2>ติดตามรายวัน แยกรอบ</h2>`, `<p className="desc">นับครั้งที่กดบันทึกผลในแต่ละวัน (เวลาไทย) ตามตัวกรองด้านบน · รวมรอบที่ระบบบันทึกจากแท็ก Pancake</p>`, table `วัน | รอบ 1 … รอบ 7 | รวม` with `thaiDay(day)` from `../viewModel`, zero → `–`, a last row `รวมทั้งช่วง` with column sums; if `byDay` is empty show `<p className="desc">ยังไม่มีการติดตามในช่วงนี้</p>`. Numbers right-aligned with `className="num"` like the per-admin table.
- [ ] **Step 6:** Run `npm run build` — expected: no errors.
- [ ] **Step 7:** Commit:

```bash
git add src/followup/report.ts src/ui/followup/Report.tsx tests/followup-report.test.ts docs/superpowers/specs/2026-11-28-followup-rounds-per-day-design.md docs/superpowers/specs/2026-11-28-order-chat-link-design.md docs/superpowers/plans/2026-11-28-followup-rounds-per-day.md
git commit -m "feat(followup): report shows follow-ups per day by round 1-7"
```
