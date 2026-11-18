// Chats and tag counts kept in this browser one day at a time. day_sigs() (migration 0007) gives each day a row count
// and an md5 of its rows; a day is downloaded again only when that fingerprint changes. This saves Supabase Free egress:
// opening the dashboard used to download every chat ever uploaded. The store is a cache only: when the browser
// cannot keep anything (private window, blocked storage) everything is downloaded as before.

export type DaySigs = Map<string, { n: number; sig: string }>
type Cached<T> = { sig: string; rows: T[] }

export type DayStore<T> = {
  get(key: string): Promise<Cached<T> | undefined>
  put(key: string, v: Cached<T>): Promise<void>
  keys(): Promise<string[]>
  del(key: string): Promise<void>
}

// bump when the shape of a stored row changes, so old copies are not read
const VERSION = 'v1'
const keyOf = (kind: string, day: string) => `${VERSION}:${kind}:${day}`

const quiet = async <T>(p: () => Promise<T>, fallback: T): Promise<T> => {
  try { return await p() } catch { return fallback }
}

// rows of `days` that the server has, days ascending; each day's rows stay in the order the server sent them
// (the database sorts text with its own collation, so re-sorting here could change the order)
export async function byDay<T>(
  kind: string, sigs: DaySigs, days: string[], store: DayStore<T> | null,
  fetchDays: (days: string[]) => Promise<Map<string, T[]>>, o: { prune?: boolean } = {},
): Promise<T[]> {
  const wanted = [...new Set(days)].filter(d => sigs.has(d)).sort()
  const have = new Map<string, T[]>()
  for (const d of wanted) {
    const c = store ? await quiet(() => store.get(keyOf(kind, d)), undefined) : undefined
    if (c && c.sig === sigs.get(d)!.sig) have.set(d, c.rows)
  }
  const missing = wanted.filter(d => !have.has(d))
  if (missing.length) {
    const got = await fetchDays(missing)
    for (const d of missing) {
      const rows = got.get(d) ?? []
      have.set(d, rows)
      // an upload between day_sigs() and this download: show it, but do not keep it under the old fingerprint
      if (store && rows.length === sigs.get(d)!.n) await quiet(() => store.put(keyOf(kind, d), { sig: sigs.get(d)!.sig, rows }), undefined)
    }
  }
  if (store && o.prune) {
    const prefix = `${VERSION}:${kind}:`
    for (const k of await quiet(() => store.keys(), [] as string[])) {
      if (!k.startsWith(`${VERSION}:`) || (k.startsWith(prefix) && !sigs.has(k.slice(prefix.length)))) await quiet(() => store.del(k), undefined)
    }
  }
  return wanted.flatMap(d => have.get(d)!)
}

export function memoryStore<T>(): DayStore<T> {
  const m = new Map<string, Cached<T>>()
  return {
    get: async k => m.get(k), put: async (k, v) => { m.set(k, v) }, keys: async () => [...m.keys()], del: async k => { m.delete(k) },
  }
}

// IndexedDB: holds megabytes, unlike localStorage. null when the browser has none.
export function idbStore<T>(): DayStore<T> | null {
  if (typeof indexedDB === 'undefined') return null
  let opened: Promise<IDBDatabase> | null = null
  const open = () => (opened ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('hylme-admin-cache', 1)
    req.onupgradeneeded = () => { req.result.createObjectStore('days') }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => { opened = null; reject(req.error) }
  }))
  const run = async <R>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<R>): Promise<R> => {
    const db = await open()
    return new Promise<R>((resolve, reject) => {
      const req = op(db.transaction('days', mode).objectStore('days'))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return {
    get: k => run('readonly', s => s.get(k) as IDBRequest<Cached<T> | undefined>),
    put: async (k, v) => { await run('readwrite', s => s.put(v, k)) },
    keys: async () => (await run('readonly', s => s.getAllKeys())).map(String),
    del: async k => { await run('readwrite', s => s.delete(k)) },
  }
}
