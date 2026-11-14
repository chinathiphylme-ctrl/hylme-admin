import { useCallback, useEffect, useState } from 'react'
import { fetchFollowup, fetchOrdersByIds, onAuthChange, sessionUserId, signOut, type FollowupData } from '../../data/followup'
import type { Staff } from '../../followup/report'
import type { OrderRow } from '../../parse/types'

export type Ready = { status: 'ready'; me: Staff; orders: OrderRow[] } & FollowupData

export type FollowupState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'noStaff' }
  | { status: 'error'; message: string }
  | Ready

export type Followup = FollowupState & { reload: () => Promise<void>; signOut: () => Promise<void> }

// one load for both follow-up tabs and the sidebar badge; reloads after every save and on sign-in/out
export function useFollowup(): Followup {
  const [state, setState] = useState<FollowupState>({ status: 'loading' })

  const reload = useCallback(async () => {
    try {
      const uid = await sessionUserId()
      if (!uid) { setState({ status: 'signedOut' }); return }
      const data = await fetchFollowup()
      const me = data.staff.find(s => s.userId === uid && s.active)
      if (!me) { setState({ status: 'noStaff' }); return }
      const orders = await fetchOrdersByIds(data.links.map(k => k.orderId))
      setState({ status: 'ready', me, orders, ...data })
    } catch (e) {
      setState({ status: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }, [])

  useEffect(() => {
    void reload()
    return onAuthChange(() => { void reload() })
  }, [reload])

  const out = useCallback(async () => { await signOut(); setState({ status: 'signedOut' }) }, [])
  return { ...state, reload, signOut: out } as Followup
}
