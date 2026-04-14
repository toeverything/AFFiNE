# @affine/track

Type-safe analytics and telemetry for AFFiNE. Provides a hierarchical event model (page → segment → module → event), session management, automatic DOM-based tracking via data attributes, pluggable transport, and Sentry integration.

## Layout

```
src/
  index.ts        # Public API barrel
  events.ts       # Complete event taxonomy (source of truth for all trackable events)
  types.ts        # Derives callable chain types + EventsUnion from events.ts
  auto.ts         # makeTracker() proxy builder + enableAutoTrack() DOM listener
  tracker.ts      # Session lifecycle, engagement time, identify, middleware
  state.ts        # TrackerState — clientId, sessionId, sessionNumber (localStorage)
  telemetry.ts    # TelemetryTransport interface + event queue
  sentry.ts       # Sentry/React wrapper
```

---

## Explicit event tracking

```typescript
import { track } from '@affine/track'

// Hierarchical call chain: track.<page>.<segment>.<module>.<event>(args?)
track.$.$.$.createWorkspace({ flavour: 'local' })
track.allDocs.list.doc.openDoc()
track.doc.editor.toolbar.bold()
track.workspace.$.paywall.$.upgrade({ plan: 'pro', recurring: 'yearly' })
```

`$` means "global / any" — use it when a segment or module doesn't apply. TypeScript enforces the hierarchy and argument shapes from `events.ts`.

---

## Automatic DOM tracking

Attach tracking to any HTML element via `data-event-props` without writing JavaScript:

```html
<!-- Simple event — no args -->
<button data-event-props="allDocs.list.docMenu.deleteDoc">Delete</button>

<!-- With a single arg -->
<button
  data-event-props="$.$.$.checkout"
  data-event-arg="pro"
>Checkout</button>

<!-- With multiple typed args -->
<button
  data-event-props="$.$.$.upgrade"
  data-event-args-plan="pro"
  data-event-args-recurring="yearly"
>Upgrade</button>
```

Enable the listener once at app startup:

```typescript
import { enableAutoTrack } from '@affine/track'

enableAutoTrack(document.body, (eventName, props) => {
  // forward to your analytics backend
})
```

`enableAutoTrack` adds a single click listener to `root` that walks up the DOM looking for `data-event-props`, parses the event path, and calls the track function.

---

## Event taxonomy (`events.ts`)

Events are organised in a 4-level hierarchy. Top-level pages (~20):

| Page | Description |
|---|---|
| `$` | Global events (no specific page) |
| `doc` | Document editor |
| `edgeless` | Edgeless/canvas editor |
| `workspace` | Workspace-level actions |
| `allDocs` | All documents list |
| `collection` | Collection view |
| `tag` | Tag view |
| `trash` | Trash view |
| `menubarApp` | Desktop menubar app |
| `popup` | Popup windows |
| `clipper` | Web clipper |
| `applyModel` | AI model selection |
| … | (100+ distinct events total) |

Event categories include: workspace/doc lifecycle, auth, sharing, payments, integrations, comments, AI features, import/export, settings, search, onboarding.

---

## Session management (`tracker.ts`, `state.ts`)

```typescript
import { tracker } from '@affine/track'

// Associate events with a user
tracker.identify(userId)

// Set persistent user properties (sent with every event)
tracker.register({ role: 'admin', planType: 'pro' })

// Set user profile properties (one-time metadata)
tracker.people.set({ email: 'user@example.com' })

// Transform all events through a middleware
tracker.middleware((eventName, props) => ({
  ...props,
  appVersion: BUILD_CONFIG.appVersion,
}))

// GDPR opt-out
tracker.opt_out_tracking()
tracker.opt_in_tracking()
```

### Automatic lifecycle events

| Event | When |
|---|---|
| `first_visit` | Once per client (stored in localStorage) |
| `session_start` | Once per session |
| `user_engagement` | On `visibilitychange` (includes `engagement_time_msec`) |

**Session timeout:** 30 minutes of inactivity → new session (increments `sessionNumber` in localStorage).

### State persistence

| Data | Storage |
|---|---|
| `clientId` (nanoid) | `localStorage` — permanent |
| `sessionNumber` | `localStorage` — increments per session |
| `sessionId` | `sessionStorage` — cleared on tab close |

---

## Telemetry transport (`telemetry.ts`)

The transport layer is pluggable — connect your analytics backend:

```typescript
import { setTelemetryTransport, setTelemetryContext } from '@affine/track'

// Implement the transport interface
const myTransport: TelemetryTransport = {
  setContext(ctx: TelemetryContext): void { /* store context */ },
  track(event: TelemetryEvent): void { /* send to backend */ },
  pageview(event: TelemetryEvent): void { /* send pageview */ },
  flush(): Promise<void> { /* flush queued events */ },
}

setTelemetryTransport(myTransport)

// Set context (call after auth state changes)
setTelemetryContext({
  authStatus: 'authenticated',
  channel: 'stable',
  userId: currentUserId,
  endpoint: 'https://telemetry.affine.pro',
})
```

Events are **queued in memory** (max 500) if no transport is set, and flushed when one is registered. Call `flushTelemetry()` to force-flush.

### `TelemetryEvent` structure

```typescript
type TelemetryEvent = {
  schemaVersion: string
  eventName: string        // e.g. "$.cmdk.general.copyShareLink"
  params: EventProps       // { page, segment, module, control, type, category, id, arg }
  userId?: string
  clientId: string
  sessionId: string
  context: TelemetryContext
}
```

---

## Sentry integration (`sentry.ts`)

```typescript
import { sentry } from '@affine/track'

// Initialize (called once at app startup, reads DSN from BUILD_CONFIG)
sentry.init()

// Captures: unhandled errors, React component errors
// Tags: distribution, appVersion, editorVersion
// Integrates with React Router v6 for transaction tracing
```

---

## Public API (`index.ts`)

```typescript
import {
  track,              // Callable event chain proxy
  enableAutoTrack,    // DOM click listener for data-event-props
  tracker,            // Session + identity management
  sentry,             // Sentry wrapper

  setTelemetryTransport,  // Register analytics backend
  setTelemetryContext,    // Update auth/channel context
  flushTelemetry,         // Force-flush event queue

  type EventArgs,     // Typed args per event (from events.ts)
  type Events,        // Full event taxonomy type
} from '@affine/track'
```

---

## Dependencies

- `@sentry/react` — error tracking + React Router tracing
- `@affine/debug` — debug logging
- `nanoid` — client ID generation
- `react-router-dom` — React Router integration for Sentry tracing
