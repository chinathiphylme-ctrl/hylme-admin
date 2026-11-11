import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConvRow } from '../src/parse/types'

const mock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('../src/data/client', () => ({ db: () => mock }))
import { fetchAllConvs } from '../src/data/read'
import { saveMessages } from '../src/data/write'

const row: ConvRow = { conversationId: 'c', day: '2026-11-06', pageId: '100379779472465',
  firstAt: '2026-11-06T10:00:00+07:00', lastAt: '2026-11-06T10:00:00+07:00', msgCount: 1,
  hasPhone: false, firstKind: 'typed', tags: ['6/11'], topics: ['ราคา/แพง'], pancakeUrl: '' }

function query(result: unknown) {
  const builder: Record<string, unknown> = {}
  for (const key of ['select', 'order', 'range', 'returns', 'limit']) builder[key] = vi.fn(() => builder)
  builder.then = (done: (r: unknown) => unknown) => Promise.resolve(result).then(done)
  return builder
}

beforeEach(() => { mock.from.mockReset(); mock.rpc.mockReset() })
describe('topics at the database boundary', () => {
  it('reads the old schema without breaking the existing dashboard', async () => {
    const newer = query({ data: null, error: { message: 'column conversations.topics does not exist' } })
    const legacy = query({ data: [{ day: row.day, conversation_id: 'c', page_id: row.pageId,
      first_at: row.firstAt, last_at: row.lastAt, msg_count: 1, has_phone: false, first_kind: 'typed', tags: row.tags, pancake_url: '' }], error: null })
    mock.from.mockReturnValueOnce(newer).mockReturnValueOnce(legacy)
    expect((await fetchAllConvs())[0].topics).toEqual([])
    expect(newer.select).toHaveBeenCalledWith(expect.stringContaining(',topics'))
    expect(legacy.select).not.toHaveBeenCalledWith(expect.stringContaining(',topics'))
  })
  it('surfaces non-schema read errors instead of treating them as old data', async () => {
    mock.from.mockReturnValue(query({ data: null, error: { message: 'connection failed' } }))
    await expect(fetchAllConvs()).rejects.toThrow('connection failed')
    expect(mock.from).toHaveBeenCalledTimes(1)
  })
  it('refuses message uploads until the topics schema exists, avoiding silently discarded topics', async () => {
    mock.from.mockReturnValue(query({ data: null, error: { message: 'column conversations.topics does not exist' } }))
    await expect(saveMessages('test-only', 'm.xlsx', [row])).rejects.toThrow('ต้องปรับฐานข้อมูล')
    expect(mock.rpc).not.toHaveBeenCalled()
  })
  it('sends only persisted conversation fields, never quote candidates or message text', async () => {
    mock.from.mockReturnValue(query({ data: [], error: null }))
    mock.rpc.mockResolvedValue({ data: 1, error: null })
    const withText = { ...row, text: 'ข้อความทดสอบที่ต้องไม่ส่ง', candidates: [{ text: 'ไม่ส่งเช่นกัน' }] }
    expect(await saveMessages('test-only', 'm.xlsx', [withText])).toBe(1)
    const payload = mock.rpc.mock.calls[0][1].p_convs[0]
    expect(payload.topics).toEqual(['ราคา/แพง'])
    expect(payload).not.toHaveProperty('text')
    expect(payload).not.toHaveProperty('candidates')
  })
})
