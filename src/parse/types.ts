import type { PageId } from '../config/pages'

export type Sheet = { name: string; rows: unknown[][] }

export type TagRow = { day: string; pageId: PageId; tag: string; color: string; count: number }

export type TagStatsResult =
  | { ok: true; fileName: string; rows: TagRow[]; days: string[]; pageIds: PageId[]; tags: { tag: string; color: string }[] }
  | { ok: false; fileName: string; error: string }
