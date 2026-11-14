import type { PageId } from '../config/pages'
import type { OrderLink, Role, Staff } from '../followup/report'
import type { FuEvent, FuLead, LeadStatus, RoundResult } from '../followup/schedule'
import type { LegacyRow } from '../followup/csv'
import type { OrderRow } from '../parse/types'
import { db } from './client'
import { fromDbOrder, type DbOrder } from './mappers'

const PAGE = 1000

async function all<T>(table: string, cols: string, order: string): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db().from(table).select(cols).order(order).range(from, from + PAGE - 1).returns<T[]>()
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return out
  }
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args)
  // the follow-up RPCs raise Thai messages meant for the person using the screen
  if (error) throw new Error(error.message)
  return data as T
}

export type DbLead = {
  id: string; name: string; product: string; owner_id: string; first_day: string; page_id: string | null; chat_url: string
  objection: string; notes: string; status: LeadStatus; version: number; created_at: string; updated_at: string
}
export type DbEvent = {
  id: number; lead_id: string; kind: FuEvent['kind']; round_no: number | null; result: string | null; due_day: string | null
  note: string; order_id: string | null; at: string; by: string | null
}

export const fromDbLead = (r: DbLead): FuLead => ({
  id: r.id, name: r.name, product: r.product, ownerId: r.owner_id, firstDay: r.first_day, pageId: r.page_id as PageId | null,
  chatUrl: r.chat_url, objection: r.objection, notes: r.notes, status: r.status, version: r.version, createdAt: r.created_at, updatedAt: r.updated_at,
})
export const fromDbEvent = (r: DbEvent): FuEvent => ({
  id: Number(r.id), leadId: r.lead_id, kind: r.kind, roundNo: r.round_no, result: r.result, dueDay: r.due_day, note: r.note,
  orderId: r.order_id, at: r.at, by: r.by,
})

// ---- sign-in ----

export async function signIn(email: string, password: string) {
  const { error } = await db().auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw new Error(/invalid/i.test(error.message) ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : error.message)
}

export async function signOut() {
  await db().auth.signOut()
}

export async function sessionUserId(): Promise<string | null> {
  const { data } = await db().auth.getSession()
  return data.session?.user.id ?? null
}

export function onAuthChange(cb: () => void): () => void {
  // only react to real sign-in/out; supabase-js deadlocks if its own calls run inside this callback, hence the timeout
  const { data } = db().auth.onAuthStateChange(event => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') setTimeout(cb, 0)
  })
  return () => data.subscription.unsubscribe()
}

// ---- reads (row-level security limits admins to their own customers) ----

export type FollowupData = { staff: Staff[]; leads: FuLead[]; events: FuEvent[]; links: OrderLink[] }

export async function fetchFollowup(): Promise<FollowupData> {
  const [staff, leads, events, links] = await Promise.all([
    all<{ user_id: string; name: string; role: Role; active: boolean }>('staff', 'user_id,name,role,active', 'name'),
    all<DbLead>('fu_leads', 'id,name,product,owner_id,first_day,page_id,chat_url,objection,notes,status,version,created_at,updated_at', 'first_day'),
    all<DbEvent>('fu_events', 'id,lead_id,kind,round_no,result,due_day,note,order_id,at,by', 'id'),
    all<{ order_id: string; lead_id: string; linked_at: string; linked_by: string | null }>('fu_orders', 'order_id,lead_id,linked_at,linked_by', 'linked_at'),
  ])
  return {
    staff: staff.map(s => ({ userId: s.user_id, name: s.name, role: s.role, active: s.active })),
    leads: leads.map(fromDbLead),
    events: events.map(fromDbEvent),
    links: links.map(k => ({ orderId: k.order_id, leadId: k.lead_id, linkedAt: k.linked_at, linkedBy: k.linked_by })),
  }
}

// the linked Pancake orders; an id missing here has not been uploaded yet
export async function fetchOrdersByIds(ids: string[]): Promise<OrderRow[]> {
  const out: OrderRow[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db().from('pancake_orders')
      .select('order_id,day,confirmed_at,admin,source,page_id,amount,discount,cod,status,items').in('order_id', ids.slice(i, i + 200))
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as DbOrder[]).map(fromDbOrder))
  }
  return out
}

// ---- writes ----

export type LeadInput = {
  id: string | null; version: number | null; name: string; product: string; ownerId: string | null; firstDay: string
  pageId: PageId | null; chatUrl: string; objection: string; notes: string
}

export const saveLead = (l: LeadInput) => rpc<string>('fu_save_lead', {
  p_id: l.id, p_version: l.version, p_name: l.name, p_product: l.product, p_owner: l.ownerId, p_first_day: l.firstDay,
  p_page: l.pageId ?? '', p_chat_url: l.chatUrl, p_objection: l.objection, p_notes: l.notes,
})

export const sameName = (name: string, exclude: string | null) =>
  rpc<{ owner_name: string; status: LeadStatus; first_day: string }[]>('fu_same_name', { p_name: name, p_exclude: exclude })

export const recordRound = (lead: FuLead, round: number, result: RoundResult, note: string, orderId: string) =>
  rpc<number>('fu_record_round', { p_lead: lead.id, p_version: lead.version, p_round: round, p_result: result, p_note: note, p_order: orderId })

export const skipRound = (lead: FuLead, round: number, reason: string) =>
  rpc<number>('fu_skip_round', { p_lead: lead.id, p_version: lead.version, p_round: round, p_reason: reason })

export const setStatus = (lead: FuLead, status: LeadStatus, note: string, orderId: string) =>
  rpc<number>('fu_set_status', { p_lead: lead.id, p_version: lead.version, p_status: status, p_note: note, p_order: orderId })

export const linkOrder = (leadId: string, orderId: string) => rpc<void>('fu_link_order', { p_lead: leadId, p_order: orderId })
export const unlinkOrder = (orderId: string) => rpc<void>('fu_unlink_order', { p_order: orderId })
export const deleteLead = (leadId: string) => rpc<void>('fu_delete_lead', { p_lead: leadId })

export const importLegacy = (rows: (LegacyRow & { ownerId: string })[]) => rpc<number>('fu_import', {
  p_rows: rows.map(r => ({
    name: r.name, product: r.product, owner_id: r.ownerId, first_day: r.firstDay, page_id: r.pageId ?? '', chat_url: r.chatUrl,
    objection: r.objection, notes: r.notes, status: r.status, history: r.history,
  })),
})
