# @affine/routes

Declarative route definitions + code generation for type-safe path building across all AFFiNE app targets. Routes are declared once in `routes.json` and compiled into typed factory functions, absolute paths, and relative paths.

## Layout

```
routes.json          # Source of truth — declarative route tree
schema.json          # JSON Schema that validates routes.json
build.ts             # Codegen: routes.json → src/routes.ts
src/
  index.ts           # Barrel: re-exports routes + lazy utility
  lazy.ts            # lazyRoute() helper for Suspense-based lazy loading
  routes.ts          # AUTO-GENERATED — FACTORIES, ROUTES, RELATIVE_ROUTES, RouteParamsTypes
tsconfig.json
```

---

## Route declaration (`routes.json`)

Routes are declared as a nested JSON tree. Each node has a `route` (path segment, may include React Router params like `:module`) and optional `children`.

```json
{
  "admin": {
    "route": "/admin",
    "children": {
      "settings": {
        "route": "/settings/:module",
        "children": {}
      }
    }
  }
}
```

`schema.json` defines and validates this structure (recursive JSON Schema).

---

## Build pipeline (`build.ts`)

```bash
yarn build   # routes.json → src/routes.ts
```

The build script:
1. Reads and validates `routes.json` against `schema.json`
2. Recursively walks the route tree
3. Uses `path-to-regexp` to extract typed parameters from each route segment
4. Generates `src/routes.ts` with three exports and a `RouteParamsTypes` interface

Never edit `src/routes.ts` manually — it is fully regenerated on every build.

---

## Generated API (`src/routes.ts`)

### `FACTORIES` — type-safe path builders

Chainable factory functions. Call the leaf factory with the required params to get a URL string:

```typescript
import { FACTORIES } from '@affine/routes'

// Navigate to admin settings for a specific module
const path = FACTORIES.admin.settings.module({ module: 'auth' })
// → '/admin/settings/auth'

// Segments without params are called with no arguments
const path = FACTORIES.admin()
// → '/admin'
```

TypeScript enforces the correct param shape — missing or extra keys are compile errors.

### `ROUTES` — absolute path strings

Static absolute path strings (with param placeholders, for use with React Router `<Route path=...>`):

```typescript
import { ROUTES } from '@affine/routes'

<Route path={ROUTES.admin.settings} element={<AdminSettings />} />
// ROUTES.admin.settings === '/admin/settings/:module'
```

### `RELATIVE_ROUTES` — relative path strings

Same as `ROUTES` but relative (without the leading parent segments), for use in nested `<Routes>`:

```typescript
import { RELATIVE_ROUTES } from '@affine/routes'

// Inside a nested <Routes> already under /admin
<Route path={RELATIVE_ROUTES.admin.settings} element={<AdminSettings />} />
```

### `RouteParamsTypes` — typed useParams()

Interface that maps each parameterised route to its param shape. Use with React Router's `useParams()`:

```typescript
import type { RouteParamsTypes } from '@affine/routes'

// In a component rendered under /admin/settings/:module
const { module } = useParams<RouteParamsTypes['admin.settings']>()
//  module is typed as string
```

---

## `lazyRoute()` helper (`src/lazy.ts`)

Wraps `React.lazy` with a Suspense boundary for code-splitting route components:

```typescript
import { lazyRoute } from '@affine/routes'

const AdminSettings = lazyRoute(() => import('./pages/admin-settings'))

<Route path={ROUTES.admin.settings} element={<AdminSettings />} />
```

---

## Adding a new route

1. Add the route to `routes.json` following the nested structure
2. Run `yarn build` to regenerate `src/routes.ts`
3. Use `FACTORIES`, `ROUTES`, or `RELATIVE_ROUTES` in app code
4. If the route has params, `RouteParamsTypes` will automatically include the new shape

---

## Dependencies

- `path-to-regexp` — param extraction from route segments (build time only)
- Peer: `react`, `react-router-dom`
