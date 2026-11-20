# Silent Chats in Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the "ต้องตามวันนี้" list into the 7-round follow-up tab with a "บันทึกผล" button that enters the chat into the queue with a round result, and report how many listed chats were followed and bought.

**Architecture:** One security-definer SQL function `fu_start_chat` (migration 0008) creates the lead and records the round in one transaction, reusing 0005/0006 helpers. The browser keeps computing the silent list from message rows (`followList`); Care shows the part not yet in the queue; Report counts listed chats per day from the same rows.

**Tech Stack:** React 18 + TypeScript, Supabase Postgres (PGlite in tests), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-20-silent-chats-in-followup-design.md`

## Global Constraints

- Rounds fixed: day 2/5/7/14/30/45/60 from day 1; record in order; won/optout end the lead (brief p.8–9, 12).
- No customer names, phones or message text stored or shown.
- Late rounds skipped with note `เข้าระบบทีหลัง`, recorder = system (same as 0006).
- Lead `source` value for this path: `chat`; history note `เริ่มติดตามจากแชทเงียบ`.
- Revoke/grant only the new function; never blanket-revoke (project shared with another app).

## Review Focus

- Chat already in the queue (double tap, or sync added it first) → Thai error, no second lead.
- Chat started > 59 days ago → day 1 clamped to today − 59, so round 7 is still open.
- Chat the team deleted earlier (in `fu_sync_ignored`) → can be started again by hand; removed from the ignore list.
- GM presses the button → owner is an admin (name tag first, else fewer active), not the GM.
- Signed-out / non-team caller → refused by `fu_actor`.

---

### Task 1: `fu_start_chat` (migration 0008)

**Files:**
- Create: `supabase/migrations/0008_followup_start_chat.sql`
- Test: `tests/followup-start-chat.test.ts` (same PGlite harness as `tests/followup-sync.test.ts`, loading 0005, 0006, 0008)

**Interfaces:**
- Produces: `fu_start_chat(p_actor uuid, p_conv text, p_result text, p_note text, p_order text) returns uuid` (new lead id), granted to `authenticated`. `fu_leads.source` check gains `'chat'`.

- [ ] Step 1: tests — creates lead (source chat, conversation_id, product/page/url like sync, first_day = first conversations day), skips past-due rounds `เข้าระบบทีหลัง`, records result on next round by actor; `won` → status won + order linked; `optout` → status optout; second call raises `อยู่ในคิวแล้ว`; ignored chat allowed and removed from `fu_sync_ignored`; GM actor → owner admin; first_day clamp at today−59; unknown conversation raises.
- [ ] Step 2: run, expect FAIL (function missing).
- [ ] Step 3: implement; share the sync's advisory lock `hashtext('fu_sync')`; owner rule copied from `fu_sync_core`.
- [ ] Step 4: run, expect PASS. Step 5: commit.

### Task 2: client wiring + Care box

**Files:**
- Modify: `src/data/followup.ts` (`startFromChat(conversationId, result, note, orderId) => act<string>('fu_start_chat', …)`; `source` type adds `'chat'`), `src/followup/schedule.ts` (`FuLead.source`)
- Create: `src/ui/followup/SilentChats.tsx` — box + record modal (results as in `LeadDrawer` RESULTS)
- Modify: `src/ui/followup/Care.tsx` (prop `silent: FollowItem[]`; box above the today table), `src/ui/App.tsx`, `src/ui/Sidebar.tsx`, `src/ui/Overview.tsx` (button → care); delete `src/ui/Follow.tsx`
- Create: `src/followup/silent.ts` — `notQueued(items: FollowItem[], leads: FuLead[]): FollowItem[]`
- Test: `tests/followup-silent.test.ts`

- [ ] Steps: test `notQueued` drops items whose conversationId is a lead's; implement; wire UI; `tsc -b` clean; commit.

### Task 3: report line

**Files:**
- Modify: `src/followup/silent.ts` — `silentByDay(convs: ConvRow[], grades: Map<string, Grade>): Map<string, ConvRow['pageId'][] | …>` → `Map<day, {id, pageId}[]>` using `followList` on each page-day; `silentReport(byDay, leads, events, range, pageId, ownerId) → { listed, followed, won }`
- Modify: `src/ui/followup/Report.tsx` (prop `silentByDay`), `src/ui/App.tsx`
- Test: `tests/followup-silent.test.ts`

- [ ] Steps: tests (listed counts distinct chats in range/page; followed = in queue with a round or status event by person or tag; won = status won; owner filter applies to followed/won); implement; tile in Report; commit.

### Task 4: apply + deploy + manual

- [ ] Apply 0008 on Supabase (`apply_migration`), check function exists; full `vitest run` + `tsc -b`; push; watch Pages deploy; README follow-up section mentions the box.
