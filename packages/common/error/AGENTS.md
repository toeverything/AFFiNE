# @affine/error

Client-side error handling utilities for AFFiNE frontends. Provides a normalised `UserFriendlyError` class that wraps GraphQL errors, network failures, and arbitrary thrown values into a consistent shape that UI components and error boundaries can reliably inspect.

## Layout

```
src/
  index.ts            # UserFriendlyError, GraphQLError, ErrorName, UserFriendlyErrorResponse, ErrorData
  __tests__/
    index.spec.ts     # Vitest unit tests
```

## API

### `UserFriendlyError`

The central class. Extends `Error` and implements `UserFriendlyErrorResponse`.

```typescript
import { UserFriendlyError } from '@affine/error';

// Normalise anything thrown — safe to use in catch blocks
const err = UserFriendlyError.fromAny(caught);

err.name;       // ErrorName — e.g. 'WORKSPACE_NOT_FOUND', 'NETWORK_ERROR'
err.status;     // HTTP status code — e.g. 404, 500
err.code;       // Internal code string — e.g. 'NOT_FOUND'
err.type;       // Error type category string
err.message;    // Human-readable message
err.data;       // Optional structured payload (varies per error)
err.stacktrace; // Server stacktrace, if present

// Type-safe name check
err.is('WORKSPACE_NOT_FOUND'); // boolean

// Status check
err.isStatus(404); // boolean

// Network error helpers
err.isNetworkError();                      // boolean (instance method)
UserFriendlyError.isNetworkError(err);     // boolean (static)
UserFriendlyError.notNetworkError(err);    // boolean (static — useful as Array.filter predicate)
```

### `UserFriendlyError.fromAny(anything)`

Static factory — converts anything into a `UserFriendlyError`. Never throws.

| Input type | Result |
|---|---|
| `UserFriendlyError` | Returned as-is |
| `GraphQLError` (from `graphql`) | Reads `extensions` for status/code/type/name/message |
| Object with `type`, `name`, `message` | Wrapped directly |
| Object with `message` only | Wrapped as `INTERNAL_SERVER_ERROR` |
| `string` | Wrapped as `INTERNAL_SERVER_ERROR` with that message |
| Anything else (`null`, `undefined`, …) | Generic fallback message |

### `GraphQLError`

A subclass of `graphql`'s `GraphQLError` with typed `extensions` (`UserFriendlyErrorResponse`). Used internally by the GraphQL client layer; consumers typically interact with `UserFriendlyError` instead.

### `ErrorName`

Union of all server-defined `ErrorNames` (from `@affine/graphql`) plus three client-only names:

| Name | When used |
|---|---|
| `NETWORK_ERROR` | Fetch failed / no network |
| `CONTENT_TOO_LARGE` | Response body too large |
| `REQUEST_ABORTED` | Request cancelled (`AbortController`) |

### `ErrorData`

Mapped type that resolves the `data` payload shape for each `ErrorName`:

```typescript
import type { ErrorData } from '@affine/error';

type WorkspaceNotFoundData = ErrorData['WORKSPACE_NOT_FOUND'];
```

## Usage Patterns

### In a React error boundary or catch block

```typescript
import { UserFriendlyError } from '@affine/error';

try {
  await someOperation();
} catch (e) {
  const err = UserFriendlyError.fromAny(e);

  if (err.isNetworkError()) {
    showOfflineBanner();
    return;
  }

  if (err.is('WORKSPACE_NOT_FOUND')) {
    navigate('/404');
    return;
  }

  notify.error({ title: err.message });
}
```

### Filtering in arrays

```typescript
import { UserFriendlyError } from '@affine/error';

const nonNetworkErrors = errors.filter(UserFriendlyError.notNetworkError);
```

## Peer Dependencies

| Package | Why |
|---|---|
| `@affine/graphql` | `ErrorNames` enum and `ErrorDataUnion` type — drives `ErrorName` and `ErrorData` |
| `graphql` | `GraphQLError` base class |

## Testing

```bash
yarn vitest packages/common/error
```
