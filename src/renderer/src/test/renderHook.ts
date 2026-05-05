/**
 * Minimal renderHook for vitest — avoids pulling in @testing-library/react
 * for the half-dozen hook tests we have. Mirrors the public API enough
 * that the test bodies read normally:
 *
 *   const { result, rerender, unmount } = renderHook(() => useFoo(arg))
 *   expect(result.current.value).toBe(...)
 *   await act(async () => { await result.current.load() })
 *   expect(result.current.loaded).toBe(true)
 */
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

// Tell React this is a test environment so act() doesn't warn.
// Must be set before any React rendering happens.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

export interface RenderHookResult<T> {
  result: { current: T }
  rerender: () => void
  unmount: () => void
}

export function renderHook<T>(hookFn: () => T): RenderHookResult<T> {
  const result = { current: undefined as unknown as T }
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root: Root | null = createRoot(container)

  function TestComponent() {
    result.current = hookFn()
    return null
  }

  act(() => {
    root!.render(createElement(TestComponent))
  })

  return {
    result,
    rerender: () => {
      act(() => {
        root!.render(createElement(TestComponent))
      })
    },
    unmount: () => {
      act(() => {
        root?.unmount()
      })
      root = null
      container.remove()
    },
  }
}

export { act }
