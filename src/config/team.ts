// The follow-up tabs sign in with one shared Supabase Auth account. Only its password is secret; the
// address is fixed here so the team types just the password. The owner creates an account with exactly
// this address in Supabase (Authentication → Users → Add user, Auto Confirm) — no mailbox is needed.
export const TEAM_EMAIL = 'followup@hylme.team'
