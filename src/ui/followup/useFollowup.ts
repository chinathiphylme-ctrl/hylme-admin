import { useCallback, useEffect, useState } from 'react'
import {
  fetchFollowup, fetchOrdersByIds, getActor, isTeamMember, onAuthChange, sessionUserId, setActor, signOut, type FollowupData,
} from '../../data/followup'
import type { Staff } from '../../followup/report'
import type { OrderRow } from '../../parse/types'

export type Ready = { status: 'ready'; me: Staff; orders: OrderRow[] } & FollowupData

export type FollowupState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'noTeam' }
  | { status: 'pickName'; staff: Staff[] }
  | { status: 'error'; message: string }
  | Ready

export type Followup = FollowupState & {
  reload: () => Promise<void>; signOut: () => Promise<void>; pick: (id: string | null) => void
}

// one load for both follow-up tabs and the sidebar badge; reloads after every save and on sign-in/out
export function useFollowup(): Followup {
  const [state, setState] = useState<FollowupState>({ status: 'loading' })

  const reload = useCallback(async () => {
    try {
      if (!(await sessionUserId())) { setState({ status: 'signedOut' }); return }
      if (!(await isTeamMember())) { setState({ status: 'noTeam' }); return }
      const data = await fetchFollowup()
      const me = data.staff.find(s => s.id === getActor() && s.active)
      if (!me) { setState({ status: 'pickName', staff: data.staff }); return }
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
  // pick(null) goes back to the name list, e.g. when someone else uses this device
  const pick = useCallback((id: string | null) => { setActor(id); void reload() }, [reload])
  return { ...state, reload, signOut: out, pick } as Followup
}
