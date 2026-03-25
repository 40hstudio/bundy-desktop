# Bundy Desktop

macOS menu-bar app for [Bundy Clock](https://bundy.40h.studio). Clock in/out, track breaks, and automatically capture screenshots + activity every 10 minutes — all from the menu bar.

---

## Download & Install

### Option A — Download a pre-built DMG (recommended)

1. Go to the [Releases page](../../releases) and download the latest `Bundy-x.x.x-arm64.dmg` (Apple Silicon) or `Bundy-x.x.x-x64.dmg` (Intel).
2. Open the DMG and drag **Bundy.app** into your **Applications** folder.
3. First time: right-click → **Open** (macOS Gatekeeper blocks unsigned apps on double-click). After the first open you can launch normally.
4. Bundy appears in the menu bar. Click its icon to open the login popup.

### Option B — Build from source

```bash
cd bundy-desktop
npm install
npm run dist
open dist/   # DMG will be here
```

---

## Login

1. In Discord, run `/token` (or whatever command your Bundy bot exposes) to get a **6-character token**.
2. The same token works for **both** the web app (`bundy.40h.studio`) and the desktop app — you only need one.
3. Enter the token in the desktop app popup and click **Connect**.

---

## Permissions (macOS)

Two permissions are required for full functionality:

| Permission | Purpose | Where to grant |
|---|---|---|
| **Screen Recording** | Periodic screenshots (every 10 min) | System Settings → Privacy & Security → Screen Recording |
| **Accessibility** | Keyboard/mouse activity counting | System Settings → Privacy & Security → Accessibility |

The app shows in-line buttons to open the exact settings pane if a permission is missing.

---

## Development

```bash
npm install
npm run dev      # starts Electron in dev mode with hot-reload
npm run build    # production build (output in out/)
npm run dist     # build + package into DMG (output in dist/)
```

---

## Architecture

```
src/
  main/
    index.ts      ← Electron main process, Tray, IPC
    api.ts        ← HTTP calls to bundy.40h.studio
    store.ts      ← electron-store (encrypted token storage)
    screenshot.ts ← desktopCapturer → uploads every 10 min
    activity.ts   ← uiohook-napi → keyboard/mouse counts → heartbeat
  preload/
    index.ts      ← contextBridge (secure IPC bridge)
  renderer/
    src/
      App.tsx
      pages/
        Login.tsx
        Dashboard.tsx
```
