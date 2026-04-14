# @affine/electron

Electron desktop app — **main process only**. Handles window management, IPC, native OS integration, auto-updates, and the helper process for SQLite storage. The renderer UI lives in `@affine/electron-renderer`.

## Layout

```
src/
  main/                   # Electron main process
    index.ts              # App entry — lifecycle, security, single-instance, deep links
    handlers.ts           # IPC handler registry
    exposed.ts            # Handler + event metadata exposed to renderer (exposeInMainWorld)
    config.ts             # Build type, dev mode detection
    web-preferences.ts    # BrowserWindow webPreferences (sandbox, etc.)
    handlers/
      ui/                 # Window management, file dialogs, external URLs
      clipboard/          # Clipboard read/write
      config-storage/     # Persistent app config (key-value, main process side)
      updater/            # Auto-update via electron-updater
      recording/          # Screen recording
      find-in-page/       # Ctrl+F in-page search
      worker/             # Background worker process management
      tray/               # System tray icon + context menu
      application-menu/   # OS-level application menu
      windows-manager/    # Window lifecycle, popup windows, focus management
      shared-storage/     # Cross-window shared state
      security/           # Content security policies, permission handlers
      power/              # Power/battery state monitoring
  preload/                # Preload scripts (bridge between main and renderer)
    index.ts              # Preload entry
    electron-api.ts       # Main IPC API via async-call-rpc
    shared-storage.ts     # Shared storage access
    worker.ts             # Background worker support
    bootstrap.ts          # Preload initialization
  helper/                 # Helper process (runs separately, handles heavy ops)
    nbstore/              # SQLite DB adapters (v1 legacy + current)
    workspace/            # Workspace file handling
    dialog/               # Native file dialogs
    preview/              # Document preview generation
    exposed.ts            # Helper API surface
forge.config.mjs          # Electron Forge packaging config
```

---

## IPC architecture

All IPC uses `async-call-rpc` over Electron's `ipcRenderer` / `ipcMain`. The pattern:

```
Renderer (React)
  └── window.apis.*           (exposed via preload/electron-api.ts)
        └── async-call-rpc RPC
              └── main process handlers  (registered in handlers.ts)
                    └── helper process   (for DB-heavy operations)
```

### Main process handlers

| Handler group | Namespace | Key operations |
|---|---|---|
| `ui` | `window` | createWindow, openExternal, toggleDevTools, setWindowSize, dialog |
| `clipboard` | `clipboard` | readText, writeText, readFiles |
| `config-storage` | `appConfig` | get, set, clear (persistent JSON file) |
| `updater` | `updater` | checkForUpdates, downloadUpdate, installUpdate |
| `recording` | `recording` | start, stop, getDevices |
| `find-in-page` | `findInPage` | find, stopFind |
| `worker` | `worker` | create, destroy |
| `tray` | — | manages tray icon state |
| `application-menu` | — | builds OS menu from i18n strings |
| `windows-manager` | — | manages BrowserWindow lifecycle |
| `shared-storage` | `sharedStorage` | get, set — cross-window key-value |
| `power` | `power` | subscribe to power source changes |

### Preload (`src/preload/electron-api.ts`)

```typescript
// Everything exposed on window.apis in the renderer
window.apis = {
  window, clipboard, appConfig, updater, recording,
  findInPage, worker, sharedStorage, power, ...
}

// Events from main → renderer
window.events = { ...EventEmitter subscriptions }
```

---

## Helper process

A separate Node.js process spawned by the main process. Handles SQLite operations (via `@affine/nbstore/sqlite`) so that DB I/O never blocks the main process.

```
helper/nbstore/
  v1/          # Legacy v1 API adapter
  index.ts     # Current adapter
```

The helper exposes an RPC surface (`helper/exposed.ts`) consumed by the main process via `async-call-rpc`.

---

## Security configuration (`web-preferences.ts`)

```typescript
{
  sandbox: true,                  // renderer is sandboxed
  nodeIntegration: false,         // no Node.js in renderer
  contextIsolation: true,         // separate context for preload
  webSecurity: true,
  allowRunningInsecureContent: false,
}
```

Additional security in `main/index.ts`:
- Permission request handler (blocks all except: clipboard, media, display-capture)
- `will-navigate` guard (prevents navigating outside allowed origins)
- `new-window` → open in OS browser
- CSP headers on all responses

---

## Deep links

Protocol: `affine://` (registered in Forge config and `main/index.ts`).

On macOS: `open-url` event. On Windows/Linux: second instance args. Both route to `handleAffineUrl()`.

---

## Single instance

```typescript
if (!app.requestSingleInstanceLock()) {
  app.quit()  // second instance → focus first, quit self
}
```

---

## Auto-update (`handlers/updater/`)

Uses `electron-updater`. Checks for updates on startup (production only). Exposes events: `update-available`, `update-downloaded`, `update-error`.

---

## Packaging (`forge.config.mjs`)

Electron Forge with makers:

| Platform | Format | Maker |
|---|---|---|
| Windows | Squirrel installer | `@electron-forge/maker-squirrel` |
| Windows | NSIS installer | `electron-forge-maker-nsis` |
| macOS | DMG | `@electron-forge/maker-dmg` |
| Linux | .deb | `@electron-forge/maker-deb` |
| Linux | Flatpak | `@electron-forge/maker-flatpak` |
| All | .zip | `@electron-forge/maker-zip` |

---

## Build

```bash
yarn dev            # dev mode (watches + auto-reloads main process)
yarn dev:prod       # dev with production config
yarn build          # production build (esbuild)
yarn make           # package + create installers
```

## Dependencies

- `electron@39`, `electron-updater@6`
- `@electron-forge/*` makers
- `async-call-rpc@6` — IPC RPC framework
- `@sentry/electron@7` — error tracking
- `@affine/nbstore` (SQLite impls used in helper)
- `@affine/i18n` — menu strings
