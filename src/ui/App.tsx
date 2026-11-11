import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PageId } from '../config/pages'
import {
  fetchAllConvs, fetchAllTags, fetchConvs, fetchDays, fetchGroups, fetchLatestConvs, fetchOrders, fetchSeen, fetchTagRows, fetchUploads, type Upload,
} from '../data/read'
import { groupOf } from '../grouping/rules'
import { followList, type Seen } from '../metrics/conversations'
import { gradeOf, toLeads, type Lead } from '../metrics/leads'
import { addDays, rangeFor, type DateRange, type RangeKey } from '../metrics/range'
import type { ConvRow, OrderRow, TagRow } from '../parse/types'
import { FilterBar } from './FilterBar'
import { Follow } from './Follow'
import { Overview } from './Overview'
import { Ads } from './Ads'
import { Quotes } from './Quotes'
import { Sidebar, TITLES, type Tab } from './Sidebar'
import { Tags } from './Tags'
import { Upload as UploadScreen } from './Upload'
import { thaiDayLong } from './viewModel'

type Base = {
  days: string[]
  overrides: Record<string, string>
  adNames: Record<string, string>
  latestConvs: ConvRow[]
  seen: Seen[]
  uploads: Upload[]
  allTags: { tag: string; color: string; total: number }[]
  leads: Lead[]
}

export function App() {
  const [tab, setTab] = useState<Tab>('overview')
  const [page, setPage] = useState<PageId | 'all'>('all')
  const [rangeKey, setRangeKey] = useState<RangeKey>('day')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [autoRange, setAutoRange] = useState<RangeKey | null>(null)
  const [loadedKey, setLoadedKey] = useState('')
  const [custom, setCustom] = useState<DateRange | null>(null)
  const [base, setBase] = useState<Base | null>(null)
  const [rows, setRows] = useState<TagRow[] | null>(null)
  const [convs, setConvs] = useState<ConvRow[]>([])
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const reload = useCallback(() => setVersion(v => v + 1), [])

  useEffect(() => {
    let live = true
    // leads need each chat's whole history: a chat's start and "new" status come from its first export ever,
    // so they must not depend on the range being viewed
    Promise.all([fetchDays(), fetchGroups(), fetchLatestConvs(), fetchSeen(), fetchUploads(), fetchAllTags(), fetchAllConvs()])
      .then(([days, groups, latestConvs, seen, uploads, allTags, allConvs]) => {
        if (live) setBase({ days, ...groups, latestConvs, seen, uploads, allTags, leads: toLeads(allConvs) })
      })
      .catch(e => live && setError(String(e.message ?? e)))
    return () => { live = false }
  }, [version])

  const latest = base?.days.at(-1) ?? null
  const range = useMemo(() => (latest ? rangeFor(rangeKey, latest, custom ?? undefined, selectedDay ?? undefined) : null), [latest, rangeKey, custom, selectedDay])
  const dataKey = range ? `${range.from}|${range.to}|${version}` : ''

  useEffect(() => {
    if (!range) return
    let live = true
    setRows(null)
    // widen to 14 days so the trend chart has context even for a one-day view
    const widened = { from: range.from < addDays(range.to, -13) ? range.from : addDays(range.to, -13), to: range.to }
    Promise.all([fetchTagRows(widened), fetchConvs(range), fetchOrders(range)])
      .then(([r, c, o]) => { if (live) { setRows(r); setConvs(c); setOrders(o); setLoadedKey(dataKey) } })
      .catch(e => live && setError(String(e.message ?? e)))
    return () => { live = false }
  }, [range?.from, range?.to, version]) // eslint-disable-line react-hooks/exhaustive-deps

  // follow-list grades use every export of those chats, not just the latest file
  const follow = useMemo(() => {
    const grades = new Map((base?.leads ?? []).map(l => [l.conversationId, gradeOf(l)]))
    return followList(base?.latestConvs ?? [], grades)
  }, [base])
  const unassigned = useMemo(
    () => (base?.allTags ?? []).filter(t => groupOf(t.tag, base!.overrides) === 'ยังไม่จัดกลุ่ม').length, [base])

  // one day has too few chats to judge an ad, so the ads tab opens on 30 days
  const goTab = (t: Tab) => {
    if (t === 'ads' && tab !== 'ads' && rangeKey === 'day' && !selectedDay) { setAutoRange('day'); setRangeKey('30d') }
    if (tab === 'ads' && t !== 'ads' && autoRange) { setRangeKey(autoRange); setAutoRange(null) }
    setTab(t)
  }

  const pickRange = (k: RangeKey) => {
    setAutoRange(null)
    setRangeKey(k)
    if (k === 'custom' && !custom && latest) setCustom({ from: addDays(latest, -6), to: latest })
  }

  const pickDay = (day: string) => {
    setSelectedDay(day)
    setAutoRange(null)
    setRangeKey('day')
  }

  let body: React.ReactNode
  if (error) {
    body = (
      <section className="card">
        <h2>โหลดข้อมูลไม่ได้ ลองรีเฟรช</h2>
        <p className="desc">{error}</p>
        <p className="desc">ถ้าไม่มีใครเปิดเว็บนาน 7 วัน ฐานข้อมูลแบบฟรีจะหยุดพัก ให้เจ้าของเข้า Supabase แล้วกด Restore project</p>
      </section>
    )
  } else if (!base) {
    body = <div className="grid g-200">{[0, 1, 2, 3].map(i => <div key={i} className="skeleton" />)}</div>
  } else if (tab === 'upload') {
    body = <UploadScreen uploads={base.uploads} overrides={base.overrides} onSaved={reload} goTags={() => goTab('tags')} />
  } else if (tab === 'tags') {
    body = <Tags tags={base.allTags} overrides={base.overrides} adNames={base.adNames} onSaved={reload} />
  } else if (tab === 'ads' && latest && range) {
    // leads load with base, so the ads tab is ready as soon as base is
    body = <Ads leads={base.leads} range={range} page={page} adNames={base.adNames} goTags={() => goTab('tags')} />
  } else if (tab === 'quotes') {
    body = <Quotes leads={base.leads} days={base.days} />
  } else if (tab === 'follow') {
    body = <Follow items={follow} />
  } else if (!latest || !range) {
    body = <section className="card"><h2>ยังไม่มีข้อมูล อัปโหลดไฟล์แรกได้ที่เมนูอัปโหลด</h2></section>
  } else if (!rows || loadedKey !== dataKey) {
    body = <div className="grid g-200">{[0, 1, 2, 3].map(i => <div key={i} className="skeleton" />)}</div>
  } else {
    body = <Overview rows={rows} convs={convs} orders={orders} leads={base.leads} seen={base.seen} range={range} page={page} setPage={setPage}
      overrides={base.overrides} adNames={base.adNames} followCount={follow.length} goFollow={() => setTab('follow')} />
  }

  return (
    <div className="shell">
      <Sidebar tab={tab} setTab={goTab} followCount={follow.length} unassigned={unassigned} latest={latest} uploads={base?.uploads ?? []} />
      <main className="main">
        <header className="head">
          <div className="head-top">
            <div className="stack" style={{ gap: 2 }}>
              <span className="sub">{latest ? `ข้อมูลล่าสุด ${thaiDayLong(latest)}` : 'Hylme แอดมินรายวัน'}</span>
              <h1>{TITLES[tab]}</h1>
            </div>
          </div>
          {(tab === 'overview' || tab === 'ads') && latest && range && (
            <FilterBar rangeKey={rangeKey} setRangeKey={pickRange} custom={custom ?? range} setCustom={setCustom}
              days={base?.days ?? []} selectedDay={selectedDay ?? latest} setDay={pickDay}
              latest={latest} multiDay={(base?.days.length ?? 0) > 1} page={page} setPage={setPage} />
          )}
        </header>
        {body}
      </main>
    </div>
  )
}
