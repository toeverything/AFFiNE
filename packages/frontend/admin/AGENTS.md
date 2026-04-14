# @affine/admin

Self-hosted admin panel for AFFiNE server management. A standalone React SPA (React Router v7, Tailwind CSS v4, shadcn-ui) served at `/admin/`. Not part of the main AFFiNE editor app — it has its own independent bundle, routing, auth, and component library.

## Layout

```
src/
  index.tsx              # React DOM entry point
  app.tsx                # All route definitions + auth wrapper
  setup.ts               # Bootstrap (imports theme, etc.)
  global.css             # Tailwind + @toeverything/theme CSS variables
  utils.ts               # cn() (clsx+twMerge), email/password validators
  fetch-utils.ts         # affineFetch — adds CSRF token + x-affine-version to all requests
  use-query.ts           # useQuery() — SWR wrapper for GraphQL (with suspense)
  use-mutation.ts        # useMutation() — SWRMutation wrapper for GraphQL mutations
  hooks/
    use-debounced-value.ts
  components/
    theme-provider.tsx   # Dark/light mode context
    ui/                  # 30+ shadcn-ui components (Radix UI primitives + Tailwind)
    shared/
      data-table.tsx     # Reusable paginated table (TanStack Table)
  modules/
    common.ts            # useServerConfig(), useCurrentUser(), isAdmin()
    layout.tsx           # 3-panel resizable layout
    header.tsx           # Page header (title + action slot)
    nav/                 # Sidebar navigation + user dropdown
    panel/               # Right panel context (open/close/content)
    auth/                # Login page
    setup/               # First-run server setup form
    dashboard/           # Analytics & metrics (Cloud/SaaS only)
    accounts/            # User management
    workspaces/          # Workspace management
    queue/               # Job queue monitoring (@queuedash/ui)
    ai/                  # AI config (placeholder, disabled for self-hosted)
    settings/            # Server configuration accordion
    about/               # Server info
```

---

## Routes (`app.tsx`)

All routes are nested under `/admin/`. The root loader checks `config.initialized` and redirects to `/admin/setup` if the server has not been configured yet.

| Path | Module | Access |
|---|---|---|
| `/admin/auth` | `auth/` | Public (redirects away if already logged in) |
| `/admin/setup` | `setup/` | Public (only shown when `initialized === false`) |
| `/admin/dashboard` | `dashboard/` | Admin only (Cloud/SaaS) |
| `/admin/accounts` | `accounts/` | Admin only |
| `/admin/workspaces` | `workspaces/` | Admin only |
| `/admin/queue` | `queue/` | Admin only |
| `/admin/ai` | `ai/` | Admin only |
| `/admin/settings` | `settings/` | Admin only |
| `/admin/about` | `about/` | Admin only |

---

## Data fetching

All data fetching goes through SWR wrappers over GraphQL. No Redux, no React Query — just SWR + React hooks.

### `useQuery` — GraphQL reads

```typescript
import { useQuery } from '../use-query'

const { data } = useQuery(listUsersQuery, { pagination: { first: 10 } })
// Suspense-enabled; throws Promise while loading, throws Error on failure
```

### `useMutation` — GraphQL writes

```typescript
import { useMutation } from '../use-mutation'

const { trigger } = useMutation(deleteUserMutation)
await trigger({ id: userId })
// Automatically invalidates related SWR cache keys
```

### `useQueryInfinite` — Paginated lists

```typescript
const { data, loadMore } = useQueryInfinite(listUsersQuery, getKey, options)
// Server-side pagination with cursor
```

### `affineFetch` (`fetch-utils.ts`)

All requests automatically include:
- `x-affine-version` header (build version)
- `x-affine-csrf-token` from the `affine_csrf_token` cookie
- `Content-Type: application/json`

GraphQL endpoint: `/graphql`
Auth REST endpoint: `/api/auth/sign-in`
Queue tRPC endpoint: `/api/queue/trpc`

---

## Auth flow

```
Login form → POST /api/auth/sign-in
  → on success → GraphQL getUserFeaturesQuery
    → check FeatureType.Admin in features
      → if admin → redirect to /admin/accounts (or dashboard)
      → if not admin → show "not authorized" error
```

The auth wrapper in `app.tsx` checks `useCurrentUser()` on every protected route. Unauthenticated users are redirected to `/admin/auth`.

---

## Modules

### `common.ts` — Shared hooks

```typescript
// Server initialization state (from adminServerConfigQuery)
const config = useServerConfig()
// config.initialized — false = show setup page

// Currently logged-in user + their features
const { user, features } = useCurrentUser()

// Check admin access
const admin = isAdmin(features)  // checks FeatureType.Admin
```

### `accounts/` — User management

- Paginated table (10/page, server-side) via `listUsersQuery`
- Search by keyword, filter by feature flag
- Per-row actions: enable/disable account, delete, reset password
- Bulk CSV import / export
- Built with `<DataTable>` + TanStack Table

### `workspaces/` — Workspace management

- Search + sort (created date)
- Filter by workspace flags
- Right panel shows selected workspace details + shared links
- Uses `listWorkspacesQuery`

### `dashboard/` — Analytics (Cloud/SaaS only)

- Active users trend chart (time-windowed, max 96 data points with downsampling)
- Storage usage by workspace + blobs
- Top shared links ranking
- Recharts via `<ChartContainer>`
- Uses `adminDashboardQuery`

### `settings/` — Server configuration

- Accordion UI grouping config by module (email, OAuth, plugins, etc.)
- Field-level validation with React Hook Form + Zod
- Dirty state tracking → Save / Cancel buttons
- On save: calls `updateServerConfigMutation`

### `queue/` — Job queue

- Embeds `@queuedash/ui` in a scoped container to avoid Tailwind class conflicts
- Shows BullMQ queues, jobs, retries, delays

---

## UI stack

**Component library:** shadcn-ui (Radix UI primitives + Tailwind utility classes)

Key components used (all in `src/components/ui/`):

| Component | Source |
|---|---|
| Table, DataTable | TanStack React Table |
| Dialog, Sheet | Radix Dialog / Sheet |
| Accordion | Radix Accordion |
| ResizablePanels | `react-resizable-panels` |
| Toast | Sonner |
| Chart | Recharts wrapper |
| Form | React Hook Form |

**Tailwind CSS v4** with theme tokens from `@toeverything/theme`. Dark mode via `.dark` class.

**`cn()` helper:**

```typescript
import { cn } from '../utils'
// cn('base-class', condition && 'extra', variantMap[variant])
// Uses clsx + tailwind-merge to avoid class conflicts
```

---

## Layout (`layout.tsx`)

Three-panel resizable layout (desktop). On mobile (`< 768px`) the left sidebar collapses to a drawer.

```
┌─ Header ────────────────────────────────────┐
│ Left Nav │   Main Content   │  Right Panel  │
│ (fixed)  │  (scrollable)    │  (collapsible)│
└──────────┴──────────────────┴───────────────┘
```

Right panel state is managed by `PanelContext` (`modules/panel/`). Any page can open the right panel with arbitrary content:

```typescript
const { open, close } = usePanel()
open(<WorkspaceDetail id={ws.id} />)
```

---

## Build

```bash
yarn dev      # dev server with HMR
yarn build    # production bundle via affine bundle CLI
```

Output: `dist/`. Deployed as a static SPA, proxied to `/admin/` by the NestJS server.

## Key dependencies

- `react@19`, `react-router-dom@7`
- `swr@2` — server state + cache
- `@radix-ui/*`, shadcn-ui — component primitives
- `tailwindcss@4`, `@toeverything/theme` — styling
- `@tanstack/react-table@8` — data tables
- `recharts@2` — charts
- `react-hook-form`, `zod` — settings forms
- `@queuedash/ui` — queue monitoring
- `sonner` — toast notifications
