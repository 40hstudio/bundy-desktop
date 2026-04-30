import { describe, it, expect } from 'vitest'
import { formatMs, ipcThrottle } from '../utils'

describe('formatMs', () => {
  it('formats zero', () => {
    expect(formatMs(0)).toBe('00:00:00')
  })

  it('formats seconds only', () => {
    expect(formatMs(45_000)).toBe('00:00:45')
  })

  it('formats minutes and seconds', () => {
    expect(formatMs(754_000)).toBe('00:12:34')
  })

  it('formats hours, minutes and seconds', () => {
    expect(formatMs(3_723_000)).toBe('01:02:03')
  })

  it('handles large values', () => {
    expect(formatMs(86_400_000)).toBe('24:00:00')
  })

  it('truncates sub-second precision', () => {
    expect(formatMs(1_999)).toBe('00:00:01')
  })
})

describe('ipcThrottle', () => {
  it('allows the first call through', async () => {
    const fn = ipcThrottle(async (x: number) => x * 2, 1000)
    expect(await fn(5)).toBe(10)
  })

  it('rejects calls within the cooldown window', async () => {
    const fn = ipcThrottle(async () => 'ok', 1000)
    await fn()
    await expect(fn()).rejects.toThrow('Too many requests')
  })

  it('allows calls after cooldown expires', async () => {
    const fn = ipcThrottle(async () => 'ok', 50)
    await fn()
    await new Promise((r) => setTimeout(r, 60))
    expect(await fn()).toBe('ok')
  })
})
