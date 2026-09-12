# Mosaic Server — compatibility contract (v1)

Source of truth for the MIT client wire surface. Observed from:

- `packages/common/graphql` (operations as documents, not server schema)
- `packages/common/nbstore/src/impls/cloud/socket.ts`
- `packages/common/nbstore/src/impls/cloud/blob.ts`
- `packages/frontend/core` cloud auth/fetch
- `packages/frontend/apps/electron` cookie names
- Root compose healthcheck: `GET /info` must be HTTP 2xx

Status: `done` = implemented in this repo, `stub` = will return safe defaults, `todo` = not routed yet.

Client minimum server version: **0.27.0** (`MIN_SUPPORTED_SERVER_VERSION` / `BATCH_SYNC_SERVER_VERSION`). GraphQL `serverConfig.version` must satisfy `semver.gte(version, '0.27.0-0')`.

---

## 1. REST — implemented (Phase 0 + 1)

### `GET /info`

Ops / compose probe. Not used by the web GraphQL bootstrap; docker healthcheck only checks `response.ok`.

```http
GET /info HTTP/1.1
```

```json
{
  "name": "Mosaic",
  "version": "0.1.0",
  "compatibility": "0.27.5",
  "message": "Mosaic Server",
  "flavor": "allinone",
  "type": "selfhosted",
  "features": []
}
```

| Field           | Meaning                                                 |
| --------------- | ------------------------------------------------------- |
| `version`       | Mosaic Server semver                                    |
| `compatibility` | Wire-compat version advertised to clients (`>= 0.27.0`) |
| `flavor`        | Process role. Phase 0 is always `allinone`              |
| `type`          | `selfhosted`                                            |
| `features`      | Enabled `MOSAIC_FEATURES` flags                         |

Correlation headers (request or generated): `x-request-id`, `x-trace-id`. W3C `traceparent` is accepted.

### Other Phase 0 routes

| Method | Path            | Purpose                                                                        |
| ------ | --------------- | ------------------------------------------------------------------------------ |
| GET    | `/health/live`  | Process liveness                                                               |
| GET    | `/health/ready` | Readiness (memory store skips Postgres; pings when postgres persistence is on) |
| GET    | `/metrics`      | Prometheus text                                                                |

---

## 2. GraphQL — `POST /graphql` (Phase 1)

Client factory: `gqlFetcherFactory(serverBaseUrl + '/graphql')`.

Request:

- JSON `{ query, variables, operationName }` or `multipart/form-data` for `Upload`
- Header `x-operation-name: <op>`
- Header `x-affine-version: <client semver>`
- Credentials: cookies (web) or `Authorization: Bearer` (native, except listed auth paths)
- Errors: GraphQL `extensions` use UserFriendlyError `{ status, code, type, name, message, data? }`

Implemented operations:

| Op                | Document                  | Notes                                                                                                  |
| ----------------- | ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `serverConfig`    | `server-config.gql`       | `version` = `MOSAIC_COMPAT_VERSION` (`>= 0.27.0`), `type: Selfhosted`, `initialized`, password min/max |
| `oauthProviders`  | `get-oauth-providers.gql` | `OAuthProviderType` list; empty until `MOSAIC_OIDC_*` is set (Phase 6)                                 |
| `appConfig`       | `admin/config.gql`        | Stub `{}` + `compat.stub` log                                                                          |
| `getCurrentUser`  | `get-current-user.gql`    | `null` when logged out; `features` includes `Admin` for first user                                     |
| `quota`           | `quota.gql`               | Generous Mosaic stub on `UserType` (not AFFiNE seats)                                                  |
| `getWorkspaces`   | `get-workspaces.gql`      | Empty list when logged out                                                                             |
| `getWorkspace`    | `get-workspace.gql`       | Member ACL                                                                                             |
| `createWorkspace` | `create-workspace.gql`    | Auth required; creator is owner                                                                        |
| `deleteWorkspace` | `delete-workspace.gql`    | Owner only                                                                                             |

`ServerDeploymentType.Selfhosted` and `ServerFeature` enum values are client-owned. Mosaic advertises `Comment` always, `Indexer` always (query-time search), `OAuth` when OIDC is configured, `Copilot` only when `MOSAIC_AI_API_KEY` is set. It must not enable `Payment` or `CopilotEmbedding`. `mosaic` is `GET /info` only, not a GraphQL `ServerFeature`.

Out of MVP: license, Stripe, calendar, MCP, admin analytics. Stub with `null` / empty / `compat.stub` log.

---

## 3. Auth REST (Phase 1) — implemented

Cookies (HttpOnly, Secure in production, `SameSite=Lax`):

| Name                | Role               |
| ------------------- | ------------------ |
| `affine_session`    | Session id         |
| `affine_user_id`    | Current user id    |
| `affine_csrf_token` | CSRF double-submit |

CSRF: browser reads `affine_csrf_token` and sends `x-affine-csrf-token`. Captcha (optional): `x-captcha-token`, `x-captcha-provider`, `x-captcha-challenge`. Native: `x-affine-client-kind: native`.

`POST /api/auth/preflight` body `{ email }` →

```json
{
  "registered": false,
  "methods": {
    "password": { "available": true },
    "magicLink": { "available": false },
    "oauth": { "available": false, "providers": [] },
    "passkey": { "available": false, "discoverable": false }
  }
}
```

| Method | Path                              | Client                                                                                |
| ------ | --------------------------------- | ------------------------------------------------------------------------------------- |
| GET    | `/api/auth/session`               | `{ user: { id } \| null }`                                                            |
| GET    | `/api/auth/methods`               | Bound methods for current user                                                        |
| POST   | `/api/auth/preflight`             | Email probe                                                                           |
| POST   | `/api/auth/sign-in`               | Password JSON `{ email, password }`                                                   |
| POST   | `/api/auth/sign-out`              | CSRF header                                                                           |
| POST   | `/api/auth/magic-link`            | `{ email, token, client_nonce }`                                                      |
| POST   | `/api/auth/open-app/sign-in`      | Desktop/mobile                                                                        |
| POST   | `/api/auth/open-app/sign-in-code` | Desktop                                                                               |
| GET    | `/api/auth/sessions`              | Device list                                                                           |
| DELETE | `/api/auth/sessions/:id`          | Revoke one                                                                            |
| POST   | `/api/auth/sessions/revoke-all`   | Revoke others                                                                         |
| GET    | `/api/auth/captcha`               | Optional                                                                              |
| POST   | `/api/auth/session/refresh`       | Electron                                                                              |
| POST   | `/api/auth/session/revoke`        | Electron                                                                              |
| POST   | `/api/auth/session/exchange`      | Native token                                                                          |
| POST   | `/api/oauth/callback`             | `{ code, state, client_nonce }` → `{ redirectUri }` + session cookies when OIDC is on |
| POST   | `/api/oauth/preflight`            | `{ provider, client, redirect_uri, client_nonce }` → `{ url }`                        |

Bearer tokens are **not** attached to `/socket.io` or the auth paths listed in `packages/frontend/apps/mobile-shared/src/auth/request.ts`.

Admin bootstrap: `POST /api/setup/create-admin-user` `{ name, email, password }` when `serverConfig.initialized === false`. First user (setup or open signup) receives `Admin`.

Passwords: Argon2id (`m=19456,t=2,p=1`). Session cookie token is stored hashed (SHA-256). CSRF is timing-safe and required for web sign-out / session revoke (not GraphQL; SameSite=Lax). Rate limits: `RATE_LIMIT_MAX` global, `RATE_LIMIT_AUTH_MAX` on auth routes.

REST errors use the same UserFriendlyError JSON as GraphQL (`status`, `code`, `type`, `name`, `message`).

---

## 4. Socket.IO space protocol (Phase 2) — implemented

Client: `socket.io-client` namespace `/`, path `/socket.io`. Self-host transports: `['polling', 'websocket']`. `reconnection: false` (client handles retry). Auth: web cookie `affine_session`, or native `handshake.auth = { token, tokenType: 'jwt' }` / `Authorization: Bearer`. CSRF is **not** required on Socket.IO.

Ack envelope:

```ts
type WebsocketResponse<T> =
  { error: { name: string; message: string } } | { data: T };
```

### Client → server

| Event                       | Payload                                                                  | Ack                                          |
| --------------------------- | ------------------------------------------------------------------------ | -------------------------------------------- |
| `space:join-batch`          | `{ spaces: { spaceType, spaceId, docId? }[], clientVersion }` max 100    | `{ clientId, success }`                      |
| `space:leave-batch`         | `{ spaceType, spaceId, docIds }`                                         | —                                            |
| `space:load-doc`            | `{ spaceType, spaceId, docId, stateVector? }`                            | `{ missing, state, timestamp }` (base64 Yjs) |
| `space:push-doc-update`     | `{ spaceType, spaceId, docId, update }`                                  | `{ timestamp }`                              |
| `space:load-doc-timestamps` | `{ spaceType, spaceId, timestamp? }`                                     | `Record<docId, number>`                      |
| `space:delete-doc`          | `{ spaceType, spaceId, docId }`                                          | `{ success?: true }`                         |
| `space:doc-lifecycle`       | `{ spaceType, spaceId, docId, lifecycle: 'trash'\|'restore'\|'delete' }` | `{ rootUpdate, timestamp }`                  |
| `space:update-awareness`    | `{ spaceType, spaceId, docId, awarenessUpdate }`                         | —                                            |
| `space:load-awarenesses`    | `{ spaceType, spaceId, docId }`                                          | —                                            |
| `telemetry:batch`           | TelemetryBatch                                                           | TelemetryAck                                 |
| `realtime:request`          | envelope                                                                 | unknown                                      |
| `realtime:subscribe`        | envelope                                                                 | `{ subscriptionId }`                         |
| `realtime:unsubscribe`      | envelope                                                                 | `{ ok: true }`                               |

### Server → client

| Event                              | Payload                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `space:broadcast-doc-updates`      | `{ spaceType, spaceId, docId, updates, timestamp, editor?, compressed? }` |
| `space:broadcast-doc-invalidation` | `{ spaceType, spaceId, timestamp }`                                       |
| `space:collect-awareness`          | `{ spaceType, spaceId, docId }`                                           |
| `space:broadcast-awareness-update` | `{ spaceType, spaceId, docId, awarenessUpdate }`                          |
| `realtime:event`                   | RealtimeEvent                                                             |

Awareness is ephemeral in-process Socket.IO rooms (not Postgres). Redis pub/sub is deferred until multi-instance deploy. Members can join/load; only workspace members (or the userspace owner) can push. Duplicate pushes (SHA-256 of update bytes) ack the original clock and do not fan out again. Compact runs inline after `SYNC_COMPACT_UPDATES` (default 64). Max update size: `SYNC_MAX_UPDATE_BYTES` (default 1 MiB).

`telemetry:batch` is a stub `{ ok: true, accepted, dropped: 0 }`. `realtime:request` / `realtime:subscribe` implement Phase 4 ops (members, access, config, invite-link, share-state, comments, quota/profile stubs); unknown ops still ack `ACTION_FORBIDDEN`. `realtime:unsubscribe` looks up the Socket.IO room tracked for the given `subscriptionId` and actually leaves it (not just an ack) so the socket stops receiving `realtime:event` broadcasts for that subscription; it acks `{ ok: true }` either way (unknown/already-unsubscribed ids are a no-op, not an error).

Binary `GET /api/workspaces/:id/docs/:docId` returns the materialized Yjs snapshot (`application/octet-stream`) for an authenticated member. Public snapshots: `GET|HEAD /api/workspaces/:id/public-docs/:docId` (Phase 4).

---

## 5. Blobs + doc meta (Phase 3) — implemented

REST (workspace membership required):

| Method | Path                                                                         |
| ------ | ---------------------------------------------------------------------------- |
| GET    | `/api/workspaces/:workspaceId/blobs/v1/:key?sourceType&docId&timestampMs`    |
| GET    | `/api/workspaces/:workspaceId/blob-manifest/v1?sourceType&docId&timestampMs` |
| GET    | `/api/workspaces/:workspaceId/readable-blob-manifest/v1?limit&cursor`        |
| PUT    | `/api/blob-uploads/:token` (self-issued upload URL; no session cookie)       |
| GET    | `/api/workspaces/:id/docs/:docId/histories/:ts`                              |

Manifest JSON: `{ version: 1, entries: [{ key, mime, size, createdAt, source }] }`. Readable manifest adds `nextCursor`.

Upload pipeline (nbstore `CloudBlobWriter`):

1. `createBlobUpload` → `PRESIGNED` (small) or `MULTIPART` (size ≥ `BLOB_MULTIPART_THRESHOLD`) or `alreadyUploaded`
2. Client `PUT`s bytes to `uploadUrl` / part URLs; response `ETag` required for multipart
3. `completeBlobUpload` materializes the object (MIME sniffed from magic bytes)
4. Fallback `setBlob(Upload!)` GraphQL multipart

`deleteBlob(permanently)` soft-deletes by default; `releaseDeletedBlobs` GC. Quota: `workspace.quota.blobLimit` / `humanReadable.blobLimit`. Storage bytes live in memory (tests) or `BLOB_DIR` (selfhost FS). S3 adapter is deferred (no Docker in this environment).

Doc history: a snapshot is stored on compact (`SYNC_COMPACT_UPDATES`). `listHistory` / `recoverDoc` / REST GET restore that snapshot. SVG is stored as `application/octet-stream`.

GraphQL: `createBlobUpload`, `completeBlobUpload`, `abortBlobUpload`, `getBlobUploadPartUrl`, `setBlob`, `listBlobs`, `deleteBlob`, `releaseDeletedBlobs`, `workspaceBlobQuota`, `listHistory`, `recoverDoc`.

---

## 6. Members, sharing, comments (Phase 4) — implemented

No SMTP: email invites still create invite ids the UI can accept. Mosaic does **not** enforce AFFiNE seat limits (`memberLimit` 10000). Owner cannot leave or be revoked. Admin/owner manage members; Collaborator cannot invite.

GraphQL:

| Op                                      | Document                                     | Notes                                  |
| --------------------------------------- | -------------------------------------------- | -------------------------------------- |
| `getInviteInfo`                         | `get-invite-info.gql`                        | Email invite or invite-link token      |
| `inviteMembers`                         | `workspace-intive-by-emails.gql`             | Per-email `{ email, inviteId, error }` |
| `acceptInviteById`                      | `workspace-invite-accept-by-invite-id.gql`   | Email match or invite-link token       |
| `revokeMember`                          | `revoke-member-permission.gql`               | Admin+; owner/admin ACL                |
| `leaveWorkspace`                        | `leave-workspace.gql`                        | Owner denied (`ACTION_FORBIDDEN`)      |
| `createInviteLink` / `revokeInviteLink` | `workspace-invite-link.gql`                  | URL `{baseUrl}/invite/{token}`         |
| `grantMember` / `approveMember`         | team grant/approve documents                 | Roles Admin/Collaborator               |
| `publishDoc` / `revokePublicDoc`        | `public-page.gql` / `revoke-public-page.gql` | Requires `enableSharing`               |
| `listComments` + comment mutations      | `comment-*.gql`                              | `ServerFeature.Comment` advertised     |

REST: `GET`/`HEAD` `/api/workspaces/:id/public-docs/:docId` — unauthenticated when published; `publish-mode` header (`page` \| `edgeless`); 404 is UserFriendlyError `DOC_NOT_FOUND` (not Fastify `not_found`).

Realtime (`@affine/realtime`): `workspace.members.get`, `workspace.access.get`, `workspace.config.get`, `workspace.invite-link.get`, `doc.share-state.get`, `comment.changes.get`, plus quota/profile stubs. Matching `realtime:subscribe` topics emit `realtime:event`.

---

## 7. Other REST used by the UI (later)

| Path                          | Usage           |
| ----------------------------- | --------------- |
| `GET /api/workspaces/:id/mcp` | MCP URL display |

---

## 8. Feature flags

Env `MOSAIC_FEATURES` is a CSV shown on `GET /info`. GraphQL `serverConfig.features` always includes `Comment` (Phase 4) and `Indexer` (Phase 6 query-time search). `OAuth` is advertised when OIDC is configured. `Copilot` is advertised only when `MOSAIC_AI_API_KEY` is set. Payment / CopilotEmbedding are never advertised. `mosaic` is `GET /info` only.

Phase 5 cutover flag: `MOSAIC_SERVER=1`.

- **Client image** (`yarn affine @affine/web build` / `Dockerfile.from-source`): `BUILD_CONFIG.isMosaicServer`, HTML `env:isSelfHosted`, same-origin server list named Mosaic, assets from `/`.
- **Server process**: adds `mosaic` to `GET /info` features.
- **Static**: `MOSAIC_STATIC_DIR` serves `selfhost.html` (preferred) or `index.html` and SPA fallback. Unset in tests / API-only.

Details: `docs/cutover.md`.

---

## 9. Product platform (Phase 6)

Query-time search (no Elasticsearch). OIDC discovery + SAML ACS. BYOK AI (`MOSAIC_AI_API_KEY`). Audit log + workspace security policy. Webhooks (HMAC `X-Mosaic-Signature`) and Jira REST v3 adapter.

| Surface                                                                 | Contract                                             | Notes                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GraphQL `workspace.search` / `searchDocs`                               | `indexer-search.gql` / `indexer-search-docs.gql`     | Indexes Yjs JSON + comments at query time; `ServerFeature.Indexer`                                                                                                                                                                                                                                                    |
| GraphQL `currentUser.copilot.quota`                                     | `copilot-quota.gql`                                  | `limit: null` unlimited when BYOK is on; `0` when off                                                                                                                                                                                                                                                                 |
| GraphQL `createCopilotSession` / `WithHistory` / `createCopilotMessage` | copilot session/message documents                    | Disabled without API key (`ACTION_FORBIDDEN`)                                                                                                                                                                                                                                                                         |
| GraphQL `auditLogs`                                                     | Mosaic admin                                         | Workspace admin or instance `Admin`                                                                                                                                                                                                                                                                                   |
| GraphQL `securityPolicy` / `updateWorkspaceSecurityPolicy`              | Mosaic                                               | Guest domains, `blockPublicLinks`, SSO requirements                                                                                                                                                                                                                                                                   |
| REST `POST /api/oauth/preflight`                                        | `{ url }` to IdP                                     | `MOSAIC_OIDC_ISSUER` + client id/secret                                                                                                                                                                                                                                                                               |
| REST `POST /api/oauth/callback`                                         | cookies + `redirectUri`                              | Links `oauth_accounts`; when discovery publishes `jwks_uri` the `id_token` is verified (`jose`, signature + issuer + audience + expiry); the server-minted OIDC `nonce` is always checked against the token's `nonce` claim when present (replay/substitution protection)                                             |
| REST `GET /api/auth/saml/metadata` + `login` + `POST .../acs`           | SAML 2.0 HTTP-POST                                   | Not listed in `oauthProviders`; when `MOSAIC_SAML_CERTIFICATE` is set, the ACS assertion's XML-DSig `<Signature>` is cryptographically verified (`xml-crypto`) against it and only signature-verified reference bytes are trusted (anti signature-wrapping); unsigned mode (no certificate) is for dev/test IdPs only |
| REST `GET /api/admin/audit-logs`                                        | JSON or `?format=csv`                                | Instance Admin                                                                                                                                                                                                                                                                                                        |
| REST webhooks                                                           | `/api/workspaces/:id/webhooks`                       | HMAC-SHA256 `sha256=...`                                                                                                                                                                                                                                                                                              |
| REST `POST /api/workspaces/:id/ai/kanban`                               | `{ prompt }` → `{ columns, rows }` max 50            | BYOK                                                                                                                                                                                                                                                                                                                  |
| REST Jira                                                               | `/api/workspaces/:id/jira/{search,import,push,pull}` | Basic auth; unconfigured → 501                                                                                                                                                                                                                                                                                        |
| REST `POST /api/webhooks/jira`                                          | inbound                                              | `X-Mosaic-Jira-Secret`                                                                                                                                                                                                                                                                                                |

Optional SIEM fan-out: `MOSAIC_SIEM_WEBHOOK_URL` (must not fail the mutation).
