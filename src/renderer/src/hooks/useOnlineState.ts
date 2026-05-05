/**
 * Subscribe to the main process's online-state IPC and expose it to
 * components. The main process polls server reachability + drains the
 * action queue; we just want a boolean for the UI banner.
 */

import { useEffect, useState } from 'react'

export interface OnlineState {
  isOnline: boolean
  queuedCount: number
}

export function useOnlineState(): OnlineState {
  const [state, setState] = useState<OnlineState>({ isOnline: true, queuedCount: 0 })
  useEffect(() => {
    return window.electronAPI.onOnlineState(setState)
  }, [])
  return state
}
