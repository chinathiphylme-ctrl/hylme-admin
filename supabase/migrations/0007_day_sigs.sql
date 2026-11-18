-- One row per day of chats and per day of tag counts: how many rows and an md5 of all of them. The browser keeps
-- each day it has downloaded and only fetches the days whose fingerprint changed (saves Supabase Free egress).
-- Rows are read with the caller's rights, so it shows exactly what the public read policies already show.
create function day_sigs() returns table (kind text, day date, n int, sig text)
language sql stable set search_path = public as $$
  select 'conv', c.day, count(*)::int, md5(string_agg(c::text, E'\n' order by c.conversation_id))
  from conversations c group by c.day
  union all
  select 'tag', t.day, count(*)::int, md5(string_agg(t::text, E'\n' order by t.page_id, t.tag))
  from tag_daily t group by t.day
$$;

-- only this function; functions from earlier migrations and other apps keep their grants
revoke execute on function day_sigs() from public, anon, authenticated;
grant execute on function day_sigs() to anon, authenticated;
