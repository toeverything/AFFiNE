# @affine/env

Shared runtime environment utilities for AFFiNE frontends. Provides browser/platform detection, global `environment` initialisation, collection filter schemas, automation action types, worker URL helpers, and miscellaneous constants. No side effects on import (except `global.ts` which writes to `globalThis`).

## Layout

```
src/
  global.ts              # setupGlobal() — detects UA, writes globalThis.environment
  ua-helper.ts           # UaHelper class — parses navigator.userAgent into boolean flags
  constant.ts            # App-wide constants, MessageCode, error classes
  filter.ts              # Zod schemas for collection filters (Filter, Collection, LiteralValue)
  automation.ts          # Action<InputSchema, Args> type for automation actions
  worker.ts              # getWorkerUrl(name) — resolves a Web Worker script URL
  is-valid-ip-address.ts # isValidIPAddress(address) — IPv4 + localhost validation
  page-info.ts           # PageInfo and GetPageInfoById types
  __tests__/
    is-valid-ip-address.spec.ts
```

## Exports

Each entry point is a separate export path — they are **not** re-exported from a single index:

| Import path | What it provides |
|---|---|
| `@affine/env/global` | `setupGlobal()`, `Environment` type |
| `@affine/env/constant` | `DEFAULT_WORKSPACE_NAME`, `UNTITLED_WORKSPACE_NAME`, `DEFAULT_SORT_KEY`, `MessageCode`, `Messages`, `WorkspaceNotFoundError`, `QueryParamError`, `Unreachable` |
| `@affine/env/filter` | `filterSchema`, `collectionSchema`, `literalValueSchema`, `Filter`, `Collection`, `LiteralValue`, `Ref`, `VariableMap`, `PropertiesMeta` |
| `@affine/env/automation` | `Action<InputSchema, Args>` type |
| `@affine/env/worker` | `getWorkerUrl(name)` |

> Note: `is-valid-ip-address.ts` and `page-info.ts` are not listed in `package.json#exports` — they are imported directly by internal consumers.

## `setupGlobal()` / `global.ts`

Must be called once at app startup (before rendering). Idempotent — guarded by `globalThis.$AFFINE_SETUP`.

```typescript
import { setupGlobal } from '@affine/env/global';
setupGlobal();
// Now globalThis.environment is populated
```

The `Environment` object written to `globalThis.environment` exposes:

| Field | Type | Source |
|---|---|---|
| `isLinux` | `boolean` | UA |
| `isMacOs` | `boolean` | UA |
| `isWindows` | `boolean` | UA |
| `isSafari` | `boolean` | UA |
| `isFireFox` | `boolean` | UA |
| `isChrome` | `boolean` | UA |
| `isIOS` | `boolean` | UA |
| `isMobile` | `boolean` | UA |
| `isPwa` | `boolean` | `display-mode: standalone` media query / `navigator.standalone` |
| `isSelfHosted` | `boolean` | Default `false` — overridden via HTML `<meta>` tag |
| `publicPath` | `string` | Default `'/'` — overridden via HTML `<meta>` tag |
| `subPath` | `string` | Default `''` — overridden via HTML `<meta>` tag |
| `chromeVersion` | `number` | Only set when `isChrome && !isIOS` |

### HTML Meta Override

Any `Environment` field can be overridden by the server via `<meta>` tags in the HTML shell:

```html
<meta name="env:isSelfHosted" content="true" />
<meta name="env:publicPath" content="/affine/" />
<meta name="env:subPath" content="/affine" />
```

`setupGlobal()` reads all `<meta>` tags whose `name` starts with `env:` and applies them after UA detection. String fields are set from `meta.content` as-is; non-string fields are `JSON.parse`d.

## `UaHelper`

Internal class used by `setupGlobal`. Can also be instantiated directly when you need to parse a user-agent string without touching globals (e.g. in SSR):

```typescript
import { UaHelper } from '@affine/env/global'; // re-exported via global.ts path
const ua = new UaHelper(navigator);
ua.isMobile; // boolean
ua.getChromeVersion(); // number
```

## `getWorkerUrl(name)` / `worker.ts`

Returns the URL for a Web Worker script, respecting the app's `subPath`:

```typescript
import { getWorkerUrl } from '@affine/env/worker';
const url = getWorkerUrl('pdf'); // → '/js/pdf-0.26.3.worker.js'
```

Worker filenames follow the convention `{name}-{BUILD_CONFIG.appVersion}.worker.js` set by the Rspack bundler. Do not construct worker URLs manually.

## Collection Filters / `filter.ts`

Zod-validated types for AFFiNE's doc collection/filter system:

```typescript
import type { Filter, Collection, LiteralValue } from '@affine/env/filter';
```

- **`LiteralValue`** — recursive union: `number | string | boolean | LiteralValue[] | Record<string, LiteralValue>`
- **`Filter`** — `{ type: 'filter', left: Ref, funcName: string, args: Literal[] }`
- **`Collection`** — `{ id, name, filterList: Filter[], allowList: string[], createDate?, updateDate? }`

Use `collectionSchema.parse(data)` and `filterSchema.parse(data)` for runtime validation.

## Constants / `constant.ts`

| Export | Value / Purpose |
|---|---|
| `DEFAULT_WORKSPACE_NAME` | `'Demo Workspace'` |
| `UNTITLED_WORKSPACE_NAME` | `'Untitled'` |
| `DEFAULT_SORT_KEY` | `'updatedDate'` |
| `MessageCode` | Numeric error codes for workspace operation failures |
| `Messages` | Human-readable messages keyed by `MessageCode` |
| `WorkspaceNotFoundError` | `TypeError` subclass with `workspaceId` field |
| `QueryParamError` | `TypeError` subclass with `targetKey` + `query` fields |
| `Unreachable` | `Error` for branches that should never be reached |

## Peer Dependencies

| Package | Why |
|---|---|
| `@blocksuite/affine` | `filter.ts` imports `DocsPropertiesMeta` type |
| `@affine/templates` | Declared peer but used transitively |

## Testing

```bash
yarn vitest packages/common/env
```
