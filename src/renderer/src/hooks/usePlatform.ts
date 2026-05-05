/**
 * Platform detection for the renderer.
 *
 * P0-1 — Several panels (Settings, Home, CallWidget) call macOS-only
 * Electron APIs. Wrapping them in `if (isMac)` prevents Windows/Linux
 * crashes the moment those builds ever ship. The platform is exposed
 * synchronously from preload, so this is a constant per-process and
 * doesn't require a state hook.
 */

const platform = window.electronAPI?.platform ?? "darwin"

export const isMac = platform === "darwin"
export const isWindows = platform === "win32"
export const isLinux = platform === "linux"

export function getPlatform(): NodeJS.Platform {
  return platform
}
