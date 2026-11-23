# Follow-up: count from the day done + bought-of-queue — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** next round due counts from the day the previous round was saved; late entries start at round 1; Care shows bought out of the queue.

**Architecture:** one pure TS function (`nextDue`) replaces `dueDay(firstDay, r)` for live due days; a matching SQL
function `fu_round_due` stores the due day on new round/skip rows. Migration 0009 replaces the four SQL functions that
skip or store due days and deletes trailing system skips. A pure `wonShare` feeds two lines in Care.

**Tech Stack:** React 18 + TS, Vitest, PGlite, Supabase.

**Spec:** docs/superpowers/specs/2026-11-23-followup-count-from-done-design.md

## Global Constraints

- Gaps `[1, 3, 2, 7, 16, 15, 15]` (from OFFSETS 2/5/7/14/30/45/60). Bangkok dates everywhere.
- Round 1 due = `max(firstDay + 1, Bangkok day of createdAt)`.
- No ดี/ไม่ดี words. Revoke/grant only on functions this migration creates. Never blanket-revoke.

## Review Focus

- Event `at` near midnight UTC → must use the Bangkok day (17:30Z = next day).
- Lead with empty/invalid `createdAt` or event `at` (test fixtures, legacy) → fall back, never throw.
- Customer whose kept system skips are followed by a person's round → next round counts from that round, untouched.
- Open screen holding deleted skips → server refuses out-of-order round with its Thai message (reload fixes).
- Owner filter "all" with zero customers → share shows no percent, not NaN.

---

### Task 1: `nextDue`, `planDays`, `wonShare` (TS)

**Files:** Modify `src/followup/schedule.ts`; Create `src/followup/share.ts`; Test `tests/followup-schedule.test.ts`, `tests/followup-share.test.ts`

**Produces:**
- `GAPS: number[]`
- `nextDue(lead: FuLead, events: FuEvent[]): { round: number; due: string } | null`
- `planDays(lead: FuLead, events: FuEvent[]): { round: number; day: string; kind: 'done' | 'skip' | 'next' | 'plan' }[]` (done/skip day = Bangkok day saved)
- `stateOf` / `queue` use `nextDue` (signatures unchanged).
- `wonShare(leads: FuLead[]): { total: number; won: number; pct: number | null }` (pct rounded to 1 decimal).

- [ ] Tests: round 2 due = round-1 saved day + 3 (late 23 Nov → 26 Nov); round 1 = first+1 on time, = created day when late; tag round dated by its `at`; Bangkok midnight; invalid `at` falls back; queue order uses new due; wonShare 3 of 48 → 6.3, empty → null.
- [ ] Implement; replace `dueDay(l.firstDay, r)` in csv.ts, Care.tsx, LeadDrawer.tsx with `nextDue` / `planDays`.
- [ ] `npx vitest run`, `npx tsc -b` green. Commit.

### Task 2: migration 0009 (SQL)

**Files:** Create `supabase/migrations/0009_followup_count_from_done.sql`; Test `tests/followup-db.test.ts`, `tests/followup-sync.test.ts`, `tests/followup-start-chat.test.ts`

- `fu_round_due(uuid, int) returns date` (same rule as `nextDue`); revoke from public, anon, authenticated.
- `create or replace` fu_record_round / fu_skip_round storing `fu_round_due`; fu_sync_core without the skip block (`skipped` stays 0); fu_start_chat without the 59-day clamp and skips (always round 1).
- Data: delete system skips (`by is null`, note 'เข้าระบบทีหลัง') with no later non-system round/skip; bump those leads' version.
- [ ] Tests: late sync entry → no skips, next round 1; start_chat on old chat → round 1, first_day = real first day; record round 2 a day late stores due = round-1 day + 3; cleanup deletes trailing skips only.
- [ ] Green; apply to prod via apply_migration; verify counts (≈226 deleted). Commit.

### Task 3: UI copy + bought share

**Files:** `src/ui/followup/Care.tsx`, `src/ui/followup/SilentChats.tsx`, `src/ui/followup/LeadDrawer.tsx`, README.md

- Care KPI ซื้อแล้ว note `จาก N คนในคิว · x%`; list view line `ตามตัวกรองนี้ N คน · ซื้อแล้ว W คน · x%` (matches(), not status).
- SilentChats modal: always round 1, drop `firstRound`. LeadDrawer plan shows actual/estimated days, "(ประมาณ)" for plan rows.
- Care 7-round plan text: "นับจากวันที่ทำรอบก่อนหน้าจริง".
- [ ] tsc, vitest, build, SSR check against live data. Commit.
