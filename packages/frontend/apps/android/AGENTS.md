# @affine/android

Android native app — Capacitor v7 hybrid app. Nearly identical in structure to `@affine/ios` but with Android-specific plugins, Gradle build config, and emulator networking.

## Layout

```
src/
  index.tsx           # Entry — native DB binding + StrictMode + Telemetry
  app.tsx             # Root component — Framework + mobile + native modules
  setup.ts            # Bootstrap: browser env + cleanup
  setup-worker.ts     # Worker setup with native DB adapter
  proxy.ts            # Custom fetch/XHR intercept for auth token injection
  plugins/
    auth/             # Authentication (magic link, OAuth, password)
    nbstore/          # Native SQLite DB via Capacitor plugin
    hashcash/         # Proof-of-work minting (native JVM/Kotlin)
    preview/          # Document thumbnail generation
    affine-theme/     # Android status bar / navigation bar theme sync
    ai-button/        # AI feature entry button (Android-specific)
capacitor.config.ts   # Capacitor project configuration
```

---

## Capacitor configuration

```typescript
// capacitor.config.ts
{
  appId: 'app.affine.pro',
  appName: 'AFFiNE',
  webDir: 'dist',
  android: { path: 'App' },
  plugins: {
    Keyboard: { resize: 'None' },
    CapacitorCookies: { enabled: false },
    CapacitorHttp:    { enabled: false },
  },
  // cleartext traffic allowed for dev server (HTTP, not HTTPS)
  // server URL: CAP_SERVER_URL env var
  // emulator default: http://10.0.2.2:8080 (host machine loopback)
}
```

---

## Android-specific plugins

### `plugins/affine-theme/` — System UI theme

Syncs the status bar and navigation bar colors with AFFiNE's light/dark theme. Uses `@capacitor/status-bar` and Android window inset APIs.

### `plugins/ai-button/` — AI feature button

Android-specific floating action button for AI copilot. Not present in iOS (uses a different UI pattern there).

---

## Shared with iOS

The following plugins have the same JavaScript API as `@affine/ios` — only the native implementation differs:

| Plugin | iOS | Android |
|---|---|---|
| `auth/` | In-app browser + deep link | In-app browser + deep link |
| `nbstore/` | SQLite via Swift | SQLite via SQLiteOpenHelper |
| `hashcash/` | Swift SHA3 | Kotlin SHA3 |
| `preview/` | CoreGraphics | Android Canvas |

See [`@affine/ios`](../ios/CLAUDE.md) for the shared architecture (proxy.ts token injection, NativeDBBinding, entry flow).

---

## Key differences from iOS

| Feature | iOS | Android |
|---|---|---|
| Status/nav bar theme | — | `affine-theme` plugin |
| AI button | — | `ai-button` plugin |
| In-app browser | `@capacitor/browser` | `@capgo/inappbrowser` |
| Status bar | — | `@capacitor/status-bar` |
| Dev server address | `localhost` | `10.0.2.2` (emulator host alias) |
| Haptics | `@capacitor/haptics` | `@capacitor/haptics` |

---

## Development

```bash
# Build JS bundle
yarn build

# Sync to Android Studio project
npx cap sync android

# Open in Android Studio
npx cap open android

# Dev with local server (emulator)
CAP_SERVER_URL=http://10.0.2.2:8080 npx cap sync android
```

For physical device dev: replace `10.0.2.2` with your machine's LAN IP.

## Key dependencies

- `@capacitor/core@7`, `@capacitor/android@7`
- `@capacitor/app`, `@capacitor/keyboard`, `@capacitor/status-bar`, `@capacitor/haptics`
- `@capgo/inappbrowser@8` — in-app browser (replaces `@capacitor/browser` for Android)
- `async-call-rpc@6` — JS ↔ native plugin RPC
- `idb@8` — IndexedDB for token storage
- `@affine/mobile-shared` — blob payload utilities
