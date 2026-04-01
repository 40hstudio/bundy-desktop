import type React from 'react'

// ─── Module-level API base (set once when config loads) ───────────────────────
// Used by Avatar and AuthImage to resolve server-relative URLs like /uploads/...
export let apiBase = ''
export function setApiBase(base: string) { apiBase = base }

// ─── Design tokens ────────────────────────────────────────────────────────────

export const C = {
  // Backgrounds
  bgTertiary: '#0e0e0e',
  bgSecondary: '#161616',
  bgPrimary: '#1c1c1c',
  bgFloating: '#080808',
  bgInput: '#282828',
  bgHover: 'rgba(255, 255, 255, 0.05)',
  bgActive: 'rgba(255, 255, 255, 0.08)',

  // Sidebar
  sidebarBg: '#161616',
  sidebarBgFallback: '#161616',
  sidebarHover: 'rgba(255, 255, 255, 0.05)',
  sidebarActive: 'rgba(0, 0, 255, 0.12)',
  sidebarText: '#6b6b6b',
  sidebarTextActive: '#cccccc',

  // Content area
  contentBg: '#1c1c1c',
  materialBg: '#161616',
  materialBgSecondary: '#0e0e0e',
  materialBorder: 'rgba(255, 255, 255, 0.06)',

  // Text
  white: '#fff',
  text: '#cccccc',
  textSecondary: '#9d9d9d',
  textMuted: '#6b6b6b',
  textTertiary: '#6b6b6b',

  // Fills
  fillTertiary: '#282828',
  fillSecondary: '#333333',
  fillPrimary: '#3e3e3e',
  separator: 'rgba(255, 255, 255, 0.06)',

  // Accent & status
  accent: '#007acc',
  accentHover: '#1a8ad4',
  accentLight: 'rgba(0, 122, 204, 0.18)',
  success: '#43B581',
  warning: '#cca700',
  danger: '#f04747',

  // Shadows
  shadowLow: '0 1px 3px rgba(0, 0, 0, 0.5)',
  shadowMed: '0 4px 12px rgba(0, 0, 0, 0.5)',
  shadowHigh: '0 8px 16px rgba(0, 0, 0, 0.6)',
  shadowModal: '0 0 0 1px rgba(255, 255, 255, 0.04), 0 16px 64px rgba(0, 0, 0, 0.7)',

  // Legacy aliases
  lgBg: '#161616',
  lgBorderSide: 'rgba(255, 255, 255, 0.06)',
  lgBlur: 'none',
  lgShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
  lgShadowLg: '0 8px 16px rgba(0, 0, 0, 0.6)',
}

// ─── Style helpers ────────────────────────────────────────────────────────────

/** Panel surface — for modals, sheets, floating panels */
export function panel(): React.CSSProperties {
  return {
    background: C.bgPrimary,
    borderRadius: 8,
    boxShadow: C.shadowMed,
  }
}

/** Backward-compat alias */
export function liquidGlass(): React.CSSProperties {
  return panel()
}

/** Recessed input field */
export function insetField(): React.CSSProperties {
  return {
    background: C.bgInput,
    border: 'none',
    borderRadius: 4,
  }
}

/** Card — content surface */
export function card(): React.CSSProperties {
  return {
    background: 'rgba(22, 22, 22, 0.45)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: 8,
    padding: 16,
    border: '1px solid rgba(255, 255, 255, 0.06)',
  }
}

/** Neumorphic surface — inset or raised */
export function neu(inset = false): React.CSSProperties {
  return inset ? insetField() : panel()
}
