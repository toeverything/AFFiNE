# @affine/electron-renderer

Electron renderer process UI. Extends `@affine/core` with desktop-specific modules, multi-window support, and main process integration via the `window.apis` IPC bridge.

## Layout

```
src/
  app/                        # Main app window
    index.tsx                 # Entry point
    app.tsx                   # Root component (Framework + desktop modules + routing)
    setup.ts                  # Bootstrap: electron module + component theme
    global.css                # Global desktop styles
    language-sync.ts          # Sync UI language ↔ main process config
    theme-sync.ts             # Sync theme ↔ system color scheme / main process
    effects/
      modules.ts              # Framework module wiring (desktop-specific)
      events.ts               # IPC event listeners (focus, update, power, etc.)
      store-manager.ts        # StoreManagerClient setup (nbstore in helper process)
      power.ts                # Battery/power state monitoring
      recording.ts            # Screen recording side-effects
      utils.ts                # Utility helpers for effects
  popup/                      # Popup window (challenge dialogs, auth flows, etc.)
    index.tsx
    app.tsx
    recording/                # Recording control popup component
  shell/                      # Shell window (minimal chrome, used for some overlays)
    index.tsx
    app.tsx
    setup.ts
  background-worker/          # Background worker entry
  global.d.ts                 # Global type extensions (window.apis, window.events)
```

---

## Entry flow

```
app/index.tsx
  └── setup.ts         (bootstrap electron module + theme)
  └── <App />
        ├── FrameworkRoot  (DI container)
        │     ├── configureCommonModules(framework)
        │     ├── configureDesktopWorkbenchModule(framework)   ← desktop tabs/nav
        │     └── configureElectronStateStorageImpls(framework) ← config-storage backed Memento
        ├── StoreManagerClient  (nbstore via helper process)
        ├── effects setup (events, power, recording, language, theme)
        └── React Router (routes from @affine/core)
```

---

## Desktop-specific module configuration (`effects/modules.ts`)

```typescript
configureCommonModules(framework)               // shared services
configureDesktopWorkbenchModule(framework)      // multi-tab workbench, window management
configureElectronStateStorageImpls(framework)   // Memento backed by electron config-storage
configureDesktopApiModule(framework)            // window.apis IPC bridge as a service
```

The key difference from `@affine/web`: storage implementations and the workbench module use Electron-native APIs instead of browser APIs.

---

## IPC event listeners (`effects/events.ts`)

Subscribes to `window.events` (set up by the preload script) and routes them into the framework:

- `updateReady` → prompt user to restart
- `systemThemeChange` → update theme service
- `networkChange` → connectivity state
- `powerChange` → battery/power source
- `focus` / `blur` → window active state

---

## Theme sync (`theme-sync.ts`)

```typescript
// Reads theme from main process config + system, writes back on user change
syncThemeWithMain(themeService, window.apis.appConfig)
```

Light/dark/system modes are synchronized between the renderer and the main process so the OS-level appearance (title bar, tray icon) matches.

---

## Language sync (`language-sync.ts`)

Reads locale from `window.apis.appConfig` on startup and writes it back whenever the user changes language in settings.

---

## Power monitoring (`effects/power.ts`)

```typescript
// Subscribes to window.events.powerChange
// Exposes current power source (AC / battery) as a LiveData in the framework
```

Used to adjust sync behavior (e.g. reduce sync frequency on battery).

---

## Multiple windows

Three separate Vite / bundle entry points, each a self-contained React app:

| Window | Entry | Purpose |
|---|---|---|
| `app` | `src/app/index.tsx` | Main editor window |
| `popup` | `src/popup/index.tsx` | Auth challenges, recording controls |
| `shell` | `src/shell/index.tsx` | Minimal chrome overlays |

Windows communicate via `window.apis.sharedStorage` (cross-window key-value) and `window.events`.

---

## Windows-specific UI

`app/app.tsx` conditionally renders a custom title bar on Windows (no native title bar):

```tsx
{BUILD_CONFIG.isWindows && <WindowsAppControls />}
```

---

## Build

```bash
yarn build   # via affine bundle CLI, outputs to dist/
```

Three bundle entry points are built: `app`, `popup`, `shell`.

## Dependencies

- `@affine/core` — shared app logic and routes
- `@affine/electron-api` — typed IPC bridge (`window.apis` types)
- `@affine/component` — design system
- `@affine/nbstore` — storage (via helper process)
- `@toeverything/infra` — DI framework
