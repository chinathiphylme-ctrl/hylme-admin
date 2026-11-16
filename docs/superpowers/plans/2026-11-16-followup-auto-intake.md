# Auto Follow-up Intake from the "ติดตาม" Tag — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chats tagged `ติดตาม` / `ติดตามN` in Pancake enter the 7-round follow-up queue by themselves after each message upload, with owner, rounds done and "bought" filled in from tags.

**Architecture:** One new migration `0006_followup_sync.sql` adds a server-side `fu_sync_core()` that reads `conversations` + `conv_tag_seen` and writes `fu_leads` / `fu_events`. Two thin entry points call it: `fu_sync_upload(p_code)` (upload code, called by the Upload page after message files save) and `fu_sync_team()` (team sign-in, called when the follow-up tabs load). The client only calls these and shows the counts.

**Tech Stack:** Supabase Postgres (plpgsql, RLS), React + TypeScript (Vite), Vitest, PGlite for DB tests.

**Spec:** `docs/superpowers/specs/2026-11-16-followup-auto-intake-design.md` (read it; it holds every rule this plan implements)

## Global Constraints

- All error/label text is Thai, written for the person using the screen.
- Dates are Asia/Bangkok: "today" is `fu_bkk_today()`.
- Rounds fall on days 2/5/7/14/30/45/60 counting day 1 = `first_day`; use the existing `fu_due_day(date, int)`.
- Revoke/grant only the functions this migration creates; never touch grants of other functions (project also hosts another app's `web_orders`).
- A failing sync must never fail or roll back a message upload.
- Store no customer names, phones or message text. Lead name = `<page name> · <product or "ไม่ระบุ"> · #<last 4 chars of conversation_id>`.
- Follow tags: exactly `ติดตาม` and `ติดตาม2`…`ติดตาม7` after trim (regex `^ติดตาม([2-7])?$`); a bare `ติดตาม` means round 0 done, `ติดตามN` means rounds 1..N done; N > 7 is not matched (none exist).
- Close tags: `ปิด`, `ปิดAds`, `ปิดOrganic`. Admin tags → staff names: `พี่ก้อย` → `พี่ก้อย`, `นุ่น🤍` → `นุ่น` (same as `src/config/admins.ts` `ADMIN_TAGS`).
- Product tags: `มะกอก`, `เดลี่ ออยล์`, `Gluta`, `Magnesium` (from `src/grouping/rules.ts` `BY_NAME`) unless `tag_groups.grp` maps that tag to another group, plus any `tag_groups` row with `grp = 'สินค้า'`.
- Page names (copy of `src/config/pages.ts`): `100379779472465` Hylme (Facebook), `516356078238016` ครบจบเรื่องไขมัน, `923678677500634` ครบจบเรื่องนอน, `igo_17841457670184062` Hylme (IG).

## Review Focus

- Same message file uploaded twice, or the tab opened on two devices at once → no duplicate customers or rounds (advisory lock + unique indexes). Test in Task 1.
- A tagged chat whose `pancake_url` equals a manually added customer's `chat_url` → the manual customer gets linked; no second customer and no unique-index error. Test in Task 1.
- Admin tag whose staff row was renamed or turned off → owner falls back to balancing, sync does not error. Test in Task 1.
- An auto-added customer later renamed / reassigned in the web → later syncs never overwrite name, owner, product or first day. Test in Task 2.
- Customer already marked bought (or stopped) by hand, then a close tag appears → no second status event, version unchanged. Test in Task 2.

---

### Task 1: Migration — schema, entry points, intake and owner

**Files:**
- Create: `supabase/migrations/0006_followup_sync.sql`
- Create: `tests/followup-sync.test.ts`

**Interfaces:**
- Consumes: from 0005 — `fu_leads`, `fu_events`, `staff`, `fu_member()`, `fu_bkk_today()`, `fu_due_day(date,int)`; from 0001 — `conversations`, `conv_tag_seen`, `tag_groups`, `assert_code(text)`.
- Produces:
  - `fu_leads.conversation_id text null` (unique index `fu_leads_conversation` where not null), `fu_leads.source text not null default 'manual' check (source in ('manual','tag'))`
  - `fu_events` kind check now also allows `'auto'`
  - table `fu_sync_ignored(conversation_id text primary key, at timestamptz not null default now())`, RLS on, no grants
  - `fu_sync_core() returns jsonb` → `{"added": int, "linked": int, "rounds": int, "skipped": int, "won": int}` — not executable by anon/authenticated
  - `fu_sync_upload(p_code text) returns jsonb` — `perform assert_code(p_code)` then core; execute granted to anon, authenticated
  - `fu_sync_team() returns jsonb` — `auth.uid()` null → `'กรุณาเข้าสู่ระบบก่อน'`; not `fu_member()` → `'บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้ระบบติดตาม ติดต่อเจ้าของระบบ'`; then core; execute granted to authenticated

- [ ] **Step 1: Write the test harness and failing intake tests in `tests/followup-sync.test.ts`**

Harness: copy `SUPABASE_STUB` and `as()` from `tests/followup-db.test.ts`; before 0005, create stand-ins for 0001: `conversations` and `conv_tag_seen` with the exact columns of `0001_init.sql` (plus `topics text[] not null default '{}'`), `tag_groups(tag text primary key, grp text, ad_name text, updated_at timestamptz default now())`, and `assert_code(p_code text)` that raises `'รหัสอัปโหลดไม่ถูกต้อง'` unless `p_code = 'ok'`. Then exec 0005, then 0006. Helper `chat(id, day, tags, {page?, url?, baseline?})` inserts one `conversations` row (url default `https://pancake.vn/x/${id}`) and upserts `conv_tag_seen` rows (`first_day = baseline ? null : day`, keep the earliest day). Helper `sync()` = `select fu_sync_upload('ok') as r`. Reset `fu_leads, fu_sync_ignored, conversations, conv_tag_seen` before each test.

Tests (names and assertions):
- `adds a chat tagged ติดตาม with page, product, link and day 1 = tag day`: `chat('c1234', day(0), ['ติดตาม','มะกอก','พี่ก้อย'])` → sync returns `added: 1`; lead `{ name: 'Hylme (Facebook) · มะกอก · #1234', product: 'มะกอก', first_day: day(0), source: 'tag', conversation_id: 'c1234', chat_url: 'https://pancake.vn/x/c1234', owner = พี่ก้อย }`; one `fu_events` row `kind 'auto'`, note `'เข้าคิวอัตโนมัติจากแท็กติดตาม'`, `by` null.
- `no product tag gives ไม่ระบุ`: name ends `· ไม่ระบุ · #<last4>`.
- `tag_groups can add or remove a product tag`: `tag_groups` (`'GABA','สินค้า'`) makes `GABA` the product; (`'Gluta','อื่นๆ'`) stops `Gluta` being one.
- `ignores chats without a follow tag and tags like ติดตามลูกค้า`: sync returns `added: 0`.
- `skips a chat already closed on or before the follow tag day`: close tag `ปิด` on the same day → `added: 0`; close tag baseline (first_day null) → `added: 0`.
- `owner is the admin whose tag appeared first`: `นุ่น🤍` on day(-3), `พี่ก้อย` on day(-1) → owner นุ่น.
- `no admin tag goes to the admin with fewer active customers`: with 2 active leads for พี่ก้อย and 0 for นุ่น, a new untagged chat → นุ่น; equal counts → order by staff name (Thai collation), first wins; GM is never chosen.
- `renamed or inactive admin falls back to balancing`: set `staff.active = false` for พี่ก้อย, chat tagged `พี่ก้อย` → owner นุ่น, no error.
- `running twice adds nothing the second time`: second sync returns `added: 0`, still 1 lead and 1 `auto` event.
- `links a manual customer with the same chat link instead of adding`: create via `fu_save_lead` (actor KOY, url `https://pancake.vn/x/c9`), then tag chat `c9` → `added: 0, linked: 1`, the manual lead now has `conversation_id 'c9'`, `source` stays `'manual'`.
- `entry points check who calls`: `fu_sync_upload('bad')` throws `รหัสอัปโหลดไม่ถูกต้อง`; anon `select fu_sync_core()` throws permission denied; `fu_sync_team()` as STRANGER throws `ยังไม่ได้รับสิทธิ์`; as TEAM returns jsonb.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/followup-sync.test.ts`
Expected: FAIL — `0006_followup_sync.sql` not found / function `fu_sync_upload` does not exist.

- [ ] **Step 3: Write `supabase/migrations/0006_followup_sync.sql` (schema + entry points + intake + owner)**

Wrap in `begin; … commit;`. Core intake algorithm (per conversation, inside `pg_advisory_xact_lock(hashtext('fu_sync'))`):
1. Link: `update fu_leads l set conversation_id = c.conversation_id` where `l.conversation_id is null and l.chat_url <> ''` and a `conversations` row has `pancake_url = l.chat_url` and no other lead already holds that conversation_id → count as `linked`.
2. Candidates: conversation_ids with a follow tag in `conv_tag_seen`, not in `fu_leads.conversation_id`, not in `fu_sync_ignored`.
3. `tag_day(conv, tag)` = `coalesce(first_day, min(conversations.day) where tag = any(tags))`; intake day `d` = min `tag_day` over its follow tags, fallback `fu_bkk_today()`.
4. Skip when any close tag row for the chat is baseline or has `first_day <= d`.
5. Owner: admin-tag rows mapped to an active `staff` row with `role = 'admin'`; earliest `tag_day` wins; ties and no match → active admin with fewest `fu_leads` where `status = 'active'`, then `order by name` (plain; PGlite has no ICU).
6. Page and link from the chat's latest `conversations` row; if that `pancake_url` is already some lead's `chat_url`, insert with `chat_url = ''` (step 1 handles real matches).
7. Insert lead (`source 'tag'`, `created_by/updated_by` null) and its `auto` event.

- [ ] **Step 4: Run to verify they pass, and the existing DB tests still pass**

Run: `npx vitest run tests/followup-sync.test.ts tests/followup-db.test.ts`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0006_followup_sync.sql tests/followup-sync.test.ts
git commit -m "feat(followup): add chats tagged ติดตาม to the queue on sync"
```

### Task 2: Migration — rounds from tags, late-entry skips, auto-bought, deletes stay deleted

**Files:**
- Modify: `supabase/migrations/0006_followup_sync.sql`
- Test: `tests/followup-sync.test.ts`

**Interfaces:**
- Consumes: Task 1's `fu_sync_core()`, harness helpers `chat()`, `sync()`.
- Produces: same `fu_sync_core()` jsonb, now filling `rounds`, `skipped`, `won`; `fu_delete_lead(p_actor uuid, p_lead uuid)` replaced (same signature) to record the tombstone.

- [ ] **Step 1: Write the failing tests**

- `ติดตามN marks rounds 1..N done`: chat tagged `ติดตาม3` on day(0) → events `round` 1,2,3 with `result 'tag'`, `by` null, `due_day = fu_due_day(first_day, r)`, `at::date` in Bangkok = the tag day; sync returns `rounds: 3`.
- `a later ติดตามN fills only the empty rounds`: lead with round 1 recorded by KOY, later chat row adds `ติดตาม2` → only round 2 inserted; KOY's round 1 untouched.
- `late entry skips past-due rounds once`: chat tagged `ติดตาม` on day(-10) → round 1 (day -9), 2 (day -6), 3 (day -4) get `skip` with note `'เข้าระบบทีหลัง'`; round 4 (day +3) open; `skipped: 3`. A second sync on the same data inserts no skips; a lead added by Task 1 today whose round 1 later becomes overdue is not skipped by later syncs.
- `close tag after intake marks bought`: lead added on day(-2), then `ปิดAds` first seen day(0) → `status 'won'`, version +1, one `status` event `result 'won'`, note `'จากแท็กปิดใน Pancake'`, `by` null; `won: 1`. Second sync: no new event.
- `manual bought or stopped is left alone`: lead set to `won` (or `optout`) via `fu_set_status`, then close tag appears → no new event, version unchanged.
- `later syncs never overwrite edits`: after intake, `fu_save_lead` renames and reassigns to นุ่น; next sync with new tags → name, owner, product, first_day unchanged.
- `deleted customers do not come back`: `fu_delete_lead(KOY, id)` then sync → `added: 0`; `fu_sync_ignored` has the conversation_id. Deleting a manual lead without conversation_id inserts nothing there.
- `inactive leads get no tag rounds`: lead `paused`, `ติดตาม2` appears → no round events.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/followup-sync.test.ts`
Expected: FAIL on the new tests only.

- [ ] **Step 3: Extend `fu_sync_core()` and replace `fu_delete_lead`**

Order inside core after intake: (a) tag rounds for every `status = 'active'` lead with a conversation_id: N = max matched follow-tag number (bare `ติดตาม` = 0); insert `round` for r in 1..N with `on conflict do nothing` against `fu_events_round_once`; `at = (tag_day + time '12:00') at time zone 'Asia/Bangkok'` of the `ติดตามN` tag that implies it (use that tag's day for all r ≤ N). (b) Only for leads inserted in this run: `skip` every round with `fu_due_day(first_day, r) < fu_bkk_today()` still empty. (c) Auto-bought for `status = 'active'` leads with conversation_id: a close-tag row with `baseline = false and first_day > lead.first_day` → update status/version/updated_at, insert status event. `fu_delete_lead`: before deleting, insert the lead's conversation_id into `fu_sync_ignored` (`on conflict do nothing`) when not null; keep `perform fu_actor(p_actor)` first and the existing grant.

- [ ] **Step 4: Run to verify all DB tests pass**

Run: `npx vitest run tests/followup-sync.test.ts tests/followup-db.test.ts`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0006_followup_sync.sql tests/followup-sync.test.ts
git commit -m "feat(followup): rounds from ติดตามN, late-entry skips, bought from close tags"
```

### Task 3: Client — types, sync on load, history labels

**Files:**
- Modify: `src/followup/schedule.ts` (types, labels)
- Modify: `src/data/followup.ts` (`DbLead`, `fromDbLead`, new `syncFromTags`)
- Modify: `src/ui/followup/useFollowup.ts` (call sync before `fetchFollowup`)
- Modify: `src/ui/followup/LeadDrawer.tsx` (labels for `auto`, `by` null)
- Test: `tests/followup-schedule.test.ts` (and update any `FuLead` fixtures in `tests/followup-*.test.ts`)

**Interfaces:**
- Consumes: Task 1/2 RPC `fu_sync_team()` and its jsonb.
- Produces:
  - `FuLead` gains `conversationId: string | null; source: 'manual' | 'tag'`; `EventKind` gains `'auto'`; `RESULT_LABEL.tag = 'ทำแล้ว (จากแท็ก Pancake)'`
  - `export type SyncResult = { added: number; linked: number; rounds: number; skipped: number; won: number }` in `src/data/followup.ts`
  - `export const syncFromTags = (): Promise<SyncResult>` → `rpc('fu_sync_team', {})`
  - `export const eventBy = (by: string | null, staff: Staff[]) => string` in `src/followup/schedule.ts`: null → `'ระบบ'`, unknown id → `'—'`, else name

- [ ] **Step 1: Write the failing tests** in `tests/followup-schedule.test.ts`: `eventBy(null, staff) === 'ระบบ'`; `eventBy(KOY.id, staff) === 'พี่ก้อย'`; `eventBy('x', staff) === '—'`; `RESULT_LABEL.tag === 'ทำแล้ว (จากแท็ก Pancake)'`; a lead with a `round` event `result 'tag'` counts that round as done in `nextRound`.
- [ ] **Step 2: Run** `npx vitest run tests/followup-schedule.test.ts` — Expected: FAIL (`eventBy` not exported).
- [ ] **Step 3: Implement** the Interfaces above. `useFollowup.reload`: after the team-member check, `await syncFromTags().catch(() => null)` (a failed sync must not block the tab), then fetch. `LeadDrawer`: `kind 'auto'` label `'เข้าคิวอัตโนมัติจากแท็กติดตาม'`; history "โดย" uses `eventBy`; for `kind 'status'`/`'skip'` show `e.note` after the label when non-empty. Map `conversation_id`/`source` in `DbLead`/`fromDbLead` and add them to the `fu_leads` select in `fetchFollowup`.
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc -b` — Expected: all PASS, no type errors.
- [ ] **Step 5: Commit** `git commit -m "feat(followup): sync tagged chats when the tab opens; label system entries"`

### Task 4: Upload page shows what entered the queue

**Files:**
- Modify: `src/data/write.ts` (new `syncFollowupUpload`)
- Modify: `src/ui/Upload.tsx:118-150` (after the save loop)

**Interfaces:**
- Consumes: `SyncResult` from Task 3; RPC `fu_sync_upload(p_code)`.
- Produces: `export const syncFollowupUpload = (code: string): Promise<SyncResult>` in `src/data/write.ts`.

- [ ] **Step 1: Implement** — in `save`, after the loop, if at least one saved-ok file was a message file (`'convs' in p`), call `syncFollowupUpload(code)`; on success push `{ fileName: 'ติดตาม 7 รอบ', ok: true, text: 'เพิ่มเข้าคิว X ราย · บันทึกรอบจากแท็ก Y · ซื้อแล้ว Z ราย' }` (use `added + linked` for X, `rounds` for Y, `won` for Z); on error push `ok: false` with `'ไฟล์ข้อความบันทึกแล้ว แต่ดึงลูกค้าเข้าคิวติดตามไม่สำเร็จ: <message> — ระบบจะลองใหม่ตอนเปิดแท็บติดตาม'`. Never call it when no message file saved.
- [ ] **Step 2: Verify** `npx vitest run` and `npx tsc -b` pass. Do not upload to production to test this (the README forbids overwriting real data for tests); the live check happens in Task 5 after deploy, on the owner's next normal upload.
- [ ] **Step 3: Commit** `git commit -m "feat(upload): report follow-up queue additions after message upload"`

### Task 5: Docs, full verification, deploy (deploy needs the owner's go-ahead)

**Files:**
- Modify: `README.md` (section "ระบบติดตามลูกค้า 7 รอบ")

- [ ] **Step 1: README** — under "ใช้งานประจำวัน" add: tagged chats enter by themselves after uploading message files; owner rule; `ติดตามN` = rounds done; close tag after entering = bought (order number still needed for sales); under "ข้อจำกัด": a tag added after the customer's last message day is not seen — add by hand; deleted customers are not re-added.
- [ ] **Step 2: Verify** `npx vitest run` (all pass), `npx tsc -b` (clean), `npm run build` (succeeds).
- [ ] **Step 3: Commit** `git commit -m "docs: auto follow-up intake"`
- [ ] **Step 4: (owner go-ahead)** Apply `0006_followup_sync.sql` to Supabase project `dbxjssrswmggkfdlhslc`; run `select fu_sync_core()` once via SQL editor role to import the existing tagged chats; report the returned counts; check `select count(*) from fu_leads where source = 'tag'` is close to the spec's 176 minus closed/ignored.
- [ ] **Step 5: (owner go-ahead)** Fast-forward `main` to `feat/followup-auto`, push, watch the Pages deploy, confirm the live bundle hash changed.
