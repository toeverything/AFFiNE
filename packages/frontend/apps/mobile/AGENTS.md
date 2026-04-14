# @affine/mobile

Generic mobile web app entry point — the web-based mobile experience (PWA / mobile browser). Configures `@affine/core` with mobile-specific modules. Distinct from `@affine/ios` / `@affine/android` which add Capacitor native plugins on top.

## Layout

```
src/
  index.tsx          # Entry point — StrictMode + Telemetry
  app.tsx            # Root component — Framework + mobile modules + routing
  setup.ts           # Bootstrap: browser env + cleanup + mobile CSS
  nbstore.worker.ts  # SharedWorker / Worker for nbstore operations
```

---

## Entry flow

```
index.tsx
  └── setup.ts              (browser bootstrap + mobile stylesheet)
  └── <App />
        ├── FrameworkRoot
        │     ├── configureCommonModules(framework)
        │     └── configureMobileModules(framework)    ← mobile-specific
        ├── StoreManagerClient  (nbstore in SharedWorker)
        ├── HapticProvider      (Vibration API)
        ├── VirtualKeyboardHandler
        ├── PopupWindowProvider
        ├── NbstoreProvider
        └── React Router (mobile routes from @affine/core)
```

---

## Mobile module configuration

```typescript
configureMobileModules(framework)
```

Registers mobile-specific service implementations:
- Mobile workbench (single-pane navigation instead of tabbed)
- Touch gesture handlers
- Mobile-optimized search and navigation

---

## Key differences from `@affine/web`

| Feature | `@affine/web` | `@affine/mobile` |
|---|---|---|
| Workbench module | `BrowserWorkbenchModule` | `MobileWorkbenchModule` |
| Haptics | — | `HapticProvider` (Vibration API) |
| Virtual keyboard | — | `VirtualKeyboardHandler` |
| Stylesheet | default | `@affine/core/mobile/styles/mobile.css` |
| Routes | desktop routes | mobile routes |

---

## Haptic feedback

```typescript
// HapticProvider wraps navigator.vibrate()
// Services call haptics.trigger('light' | 'medium' | 'heavy')
```

Uses the standard Web Vibration API (no native dependency). For native haptics on iOS/Android, use `@affine/ios` / `@affine/android` instead.

---

## Build

```bash
yarn build   # via affine bundle CLI
```

## Dependencies

- `@affine/core` — shared app logic (mobile routes included)
- `@affine/component` — design system
- `@affine/nbstore` — storage (IndexedDB backend)
- `@toeverything/infra` — DI framework
- `react@19`, `react-router-dom@6`
