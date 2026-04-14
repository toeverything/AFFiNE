# @affine/electron-api

Type bridge between the Electron main/helper processes and the renderer. Exports TypeScript types for everything available on `window.apis`, `window.events`, `window.appInfo`, and `window.sharedStorage` in the Electron renderer. Contains no runtime logic — just type re-exports and global declarations.

## How it fits together

```
Renderer (@affine/electron-renderer)
  ├── import { apis, events, appInfo, sharedStorage } from '@affine/electron-api'
  │     (gets fully-typed access to all IPC channels)
  │
  └── window.__apis / window.__events / window.__appInfo / window.__sharedStorage
        (set by preload/bootstrap.ts via contextBridge)
              │
              ├── Main process IPC  (ipcRenderer.invoke / ipcRenderer.on)
              │     → allHandlers[namespace][method](ipcEvent, ...args)
              │
              └── Helper process RPC  (async-call-rpc over MessagePort)
                    → heavy DB/file ops run off the main process thread
```

---

## Exported globals

```typescript
import { apis, events, appInfo, sharedStorage } from '@affine/electron-api'

// Is this running inside Electron?
if (appInfo?.electron) { /* safe to use apis/events */ }
```

| Export | Type | Description |
|---|---|---|
| `appInfo` | `AppInfo \| null` | Electron runtime metadata (windowName, scheme, viewId) |
| `apis` | `ClientHandler \| undefined` | All IPC handler methods |
| `events` | `ClientEvents \| undefined` | All event subscriptions |
| `sharedStorage` | `SharedStorage \| undefined` | Cross-window key-value state |

---

## `AppInfo`

```typescript
type AppInfo = {
  electron: true
  windowName: string   // 'main' | 'onboarding' | 'popup' | 'shell'
  viewId: string       // passed via process.argv from main
  scheme:
    | 'affine'
    | 'affine-canary'
    | 'affine-beta'
    | 'affine-internal'
    | 'affine-dev'
}
```

---

## `window.apis` — IPC handlers

All handler calls return a `Promise` (async-call-rpc wraps everything). Call from the renderer:

```typescript
await apis.ui.handleMinimizeApp()
await apis.clipboard.writeText('hello')
await apis.updater.checkForUpdates()
```

### Main process handler namespaces

| Namespace | Key methods | Purpose |
|---|---|---|
| `ui` | Window ops, file dialogs, tab management, theme | Window/UI control |
| `clipboard` | `readText()`, `writeText()`, `readFiles()` | Clipboard access |
| `updater` | `checkForUpdates()`, `downloadUpdate()` | Auto-update |
| `configStorage` | `get(key)`, `set(key, val)`, `clear()` | Persistent app config file |
| `findInPage` | `find(text, opts)`, `stopFind()` | Ctrl+F in-page search |
| `sharedStorage` | `get*()`, `set*()`, `del*()`, `clear*()`, `keys*()` | Cross-window state ops |
| `worker` | `create()`, `destroy()` | Background worker lifecycle |
| `recording` | `start()`, `stop()`, `getDevices()` | Screen recording |
| `popup` | Window popup management | Popup window ops |
| `i18n` | `changeLanguage(lang)` | Locale switching in main |
| `debug` | `revealLogFile()`, `logFilePath()` | Dev/debug tools |

### Helper process handler namespaces

Run in a separate Node.js process (heavy I/O, never blocks main):

| Namespace | Purpose |
|---|---|
| `nbstore` | SQLite storage adapter (current) |
| `db` | Legacy SQLite v1 adapter |
| `workspace` | Workspace file I/O |
| `dialog` | Native file open/save dialogs |
| `preview` | Document thumbnail generation |

---

## `window.events` — Event subscriptions

Each event subscriber returns an unsubscribe function:

```typescript
// Subscribe
const unsub = events.ui.onMaximized((isMaximized: boolean) => {
  setWindowMaximized(isMaximized)
})

// Unsubscribe
unsub()
```

### Main process event namespaces

| Namespace | Key events | Purpose |
|---|---|---|
| `ui` | `onMaximized`, `onFullScreen`, `onTabViewsMetaChanged`, `onTabAction`, `onToggleRightSidebar`, `onTabsStatusChange`, `onActiveTabChanged`, `onTabGoToRequest`, `onTabShellViewActiveChange`, `onAuthenticationRequest`, `onCloseView` | Window & multi-tab state |
| `updater` | `update-available`, `update-downloaded`, `update-error` | Auto-update lifecycle |
| `applicationMenu` | OS-level menu actions | App menu callbacks |
| `sharedStorage` | `onGlobalStateChanged`, `onGlobalCacheChanged` | Cross-window state sync |
| `recording` | Recording state changes | Screen recording |
| `popup` | Popup window events | Popup lifecycle |
| `power` | `power-source` | Battery / AC power changes |

### Helper process event namespaces

| Namespace | Purpose |
|---|---|
| `db` | Legacy DB events |
| `workspace` | Workspace file change events |

---

## `window.sharedStorage` — Cross-window state

Persists state across Electron windows (main app, popup, shell). Backed by `MemoryMemento` in the preload, synced to the main process via IPC.

```typescript
type SharedStorage = {
  globalState: MementoLike
  globalCache: MementoLike
}

type MementoLike = {
  get<T>(key: string): T | undefined
  set(key: string, value: unknown): void
  del(key: string): void
  clear(): void
  keys(): string[]
  watch<T>(key: string, cb: (value: T | undefined) => void): () => void  // returns unsubscribe
  ready: Promise<void>  // await before first read
}
```

```typescript
// Usage in renderer
await sharedStorage.globalState.ready
sharedStorage.globalState.set('sidebar-width', 240)

const unsub = sharedStorage.globalState.watch('sidebar-width', width => {
  setSidebarWidth(width ?? 240)
})
```

---

## IPC transport details

### Main process handlers

```
renderer → ipcRenderer.invoke('AFFINE_API_CHANNEL_NAME', 'namespace:method', ...args)
        → main ipcMain.handle → allHandlers[namespace][method](event, ...args)
        → Promise result back to renderer
```

### Helper process handlers

```
renderer → MessagePort → async-call-rpc (RPC channel: 'namespace:method')
         → helper process handler
         → Promise result back to renderer
```

The `MessagePort` is established at preload startup: main process spawns the helper and sends the port via `'helper-connection'` IPC message.

### Main process events

```
main → ipcMain.emit('AFFINE_EVENT_CHANNEL_NAME', channel, ...args)
     → ipcRenderer.on → delivered to renderer subscriber
```

Renderer subscribes/unsubscribes by sending `AFFINE_EVENT_SUBSCRIBE_CHANNEL_NAME` messages; the preload ref-counts listeners and cleans up when the count reaches 0.

---

## Security

- **Context isolation** — preload runs in an isolated context; only approved APIs reach the renderer via `contextBridge`
- **Sandbox enabled** — renderer has no Node.js access
- **Origin validation** — main process validates IPC sender before routing
- **CSP** — Content Security Policy headers on all responses

---

## Usage in `@affine/electron-renderer`

```typescript
import { apis, events, appInfo, sharedStorage } from '@affine/electron-api'

// Guard for Electron-only code
if (appInfo?.electron) {
  // Window title bar controls
  await apis.ui.handleMaximizeApp()

  // Listen for tab changes
  const unsub = events.ui.onActiveTabChanged(tabId => {
    setActiveTab(tabId)
  })

  // Shared state across windows
  await sharedStorage.globalState.ready
  sharedStorage.globalState.set('last-opened-workspace', workspaceId)
}
```

In `@affine/core`, the `DesktopApiService` wraps this package and exposes it through the DI framework so React components never import from `@affine/electron-api` directly.

---

## Export paths

```
@affine/electron-api           → src/index.ts  (types + globals)
@affine/electron-api/web-worker → src/web-worker.ts  (planned, not yet created)
```

## Dependencies

- `@affine/electron` (dev only) — types imported from main/helper process source files; no runtime dependency
