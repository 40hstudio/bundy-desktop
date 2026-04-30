import { describe, it, expect } from 'vitest'
import { formatMs, timeAgo } from '../utils/format'

describe('formatMs', () => {
  it('formats zero', () => {
    expect(formatMs(0)).toBe('00:00:00')
  })

  it('formats hours:minutes:seconds', () => {
    expect(formatMs(14_520_000)).toBe('04:02:00')
  })

  it('pads single digits', () => {
    expect(formatMs(3_661_000)).toBe('01:01:01')
  })
})

describe('timeAgo', () => {
  it('returns "just now" for < 60s', () => {
    const iso = new Date(Date.now() - 30_000).toISOString()
    expect(timeAgo(iso)).toBe('just now')
  })

  it('returns minutes ago', () => {
    const iso = new Date(Date.now() - 5 * 60_000).toISOString()
    expect(timeAgo(iso)).toBe('5m ago')
  })

  it('returns hours ago', () => {
    const iso = new Date(Date.now() - 3 * 3_600_000).toISOString()
    expect(timeAgo(iso)).toBe('3h ago')
  })
})
