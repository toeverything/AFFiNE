# @affine/debug

Thin wrapper around the [`debug`](https://github.com/debug-js/debug) library. Provides a `DebugLogger` class with level-aware methods used throughout the frontend and shared packages for namespaced, conditional logging.

## Layout

```
src/
  index.ts          # DebugLogger class + browser auto-enable logic
  __tests__/
    index.spec.ts   # Vitest unit tests
```

## API

### `DebugLogger`

```typescript
import { DebugLogger } from '@affine/debug';

const logger = new DebugLogger('affine:my-module');

logger.debug('processing item', item);
logger.info('started');
logger.warn('fallback used');
logger.error('unexpected failure', err);

// Create a child logger that appends to the namespace
const childLogger = logger.namespace('sub-feature');
// → namespace becomes 'affine:my-module:sub-feature'
```

| Method | Description |
|---|---|
| `debug(message, ...args)` | Routes through `console.debug` |
| `info(message, ...args)` | Routes through `console.info` |
| `warn(message, ...args)` | Routes through `console.warn` |
| `error(message, ...args)` | Routes through `console.error` |
| `log(level, message, ...args)` | Base method — all above delegate here |
| `namespace(extra)` | Returns a new `DebugLogger` with `:<extra>` appended to the namespace |
| `enabled` (get/set) | Toggle this logger's output without affecting siblings |

## Browser Auto-Enable

On the browser, logging is activated automatically in two cases (before any logger is constructed):

1. **URL contains `?debug`** — sets `sessionStorage['affine:debug'] = 'true'`, then enables all namespaces (`debug.enable('*')`). The flag persists across navigations within the same session even after the query string is removed.
2. **`BUILD_CONFIG.debug` is `true`** — enables `'*,-micromark'` (all namespaces except micromark parser noise).

Both paths print `"Debug logs enabled"` to the console as a visible indicator.

In non-browser environments (Node.js, Workers) the `debug` library's standard `DEBUG` environment variable controls which namespaces are active.

## Namespace Convention

All AFFiNE loggers use the prefix `affine:` followed by a module path:

```
affine:core:workspace
affine:sync:engine
affine:editor:toolbar
```

This lets you filter selectively in browser DevTools or via the `DEBUG` env variable:

```
DEBUG=affine:sync:*   # only sync-related logs
DEBUG=affine:*        # all AFFiNE logs
DEBUG=*               # everything (very verbose)
```

## Usage

```typescript
import { DebugLogger } from '@affine/debug';

const logger = new DebugLogger('affine:nbstore:indexeddb');

export class IndexedDBDocStorage {
  async get(id: string) {
    logger.debug('fetching doc %s', id);
    // ...
  }
}
```

## Testing

```bash
yarn vitest packages/common/debug
```
