# Follow-up: count each round from the day it was done, and show bought-of-queue

Approved in chat 2026-11-23 ("ทำทีเดียวเลย" for both changes; late entry: option ก, my recommendation).

## 1. Rounds count from the day the round before was actually done

**Why.** People record rounds on average 3.9 days after they are due (68 rounds so far). The schedule is fixed to day 1,
so a late round leaves the next one already due or overdue, and the customer keeps "coming back" as late. The owner
wants the next round counted from the day the team really did the last one. This overrides the brief (p.2, p.9:
"วันกำหนดไม่เลื่อนตามวันติดตามจริง"); the owner decided it.

**Rule.**
- The gaps stay the brief's: day 2 / 5 / 7 / 14 / 30 / 45 / 60 → gaps 1, 3, 2, 7, 16, 15, 15 days.
- Round 1 is due `max(first day + 1, the day the customer entered the queue)` (Bangkok dates).
- Round r > 1 is due `(Bangkok day the round r − 1 record or skip was saved) + gap[r]`.
  A ติดตามN tag round is dated the day the tag appeared, so it counts from that day.
- If round r − 1 has no record (should not happen; rounds are ordered), fall back to the fixed day.
- Later rounds in a customer's plan are shown as estimates: next due + the gaps, assuming each is done on time.
- The whole plan can run past 60 days when rounds are late. Accepted.
- Stored `fu_events.due_day` is the due day at the time of saving, so lateness per round stays visible in history.

**Late entry (option ก).** The system stops skipping past rounds ("เข้าระบบทีหลัง"). A customer who enters late
starts at round 1, due the day they entered. Applies to the sync from ติดตาม tags and to fu_start_chat
(which records round 1 at once). Existing system skips are deleted where nothing but other system skips comes after
them (226 skips, 120 customers, 118 active); customers with later rounds keep theirs so rounds stay in order.
Those customers get a version bump; open screens need one page reload.

**Not changed.** Pausing does not move dates (a resumed customer may show late). Rounds stay in order; won/opt-out stop.

## 2. Bought out of the queue (option ก: denominator = everyone in the queue)

- Care KPI "ซื้อแล้ว": add a line "จาก N คนในคิว · x%". N = customers matching the owner select; won = status won among them.
- Customer list view: a line above the table "ตามตัวกรองนี้ N คน · ซื้อแล้ว W คน · x%" over customers matching
  search + owner, ignoring the status select (else "ซื้อแล้ว" would always read 100%). The table still filters by status.
- "ซื้อแล้ว" = status won, whether set by hand or from a Pancake close tag. Neutral numbers only, no verdict words.
- GM report unchanged: its won tile counts wins inside the date range.

## Approaches considered

- Fixed schedule (brief) — rejected by the owner: late rounds pile up as overdue.
- Count from the actual day done, keep gaps (chosen).
- Count from actual day but squeeze the plan back into 60 days — more complex, and makes late rounds closer together.
