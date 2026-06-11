# AFFiNE Mobile Flutter REST API Integration Plan

This document maps the existing AFFiNE backend API endpoints to the Flutter mobile app.

## GraphQL Endpoints (from packages/frontend/core/src/modules/cloud/services/)

### Queries existentes en el backend AFFiNE:
- `workspaces` — listar workspaces del usuario
- `workspace` — detalle de workspace
- `currentUser` — usuario actual
- `docs` — documentos de un workspace
- `doc` — detalle de documento
- `collections` — colecciones de un workspace
- `tags` — tags de un workspace
- `search` — búsqueda global

### Mutations:
- `createWorkspace`, `deleteWorkspace`
- `createDoc`, `updateDoc`, `deleteDoc`
- `createCollection`, `updateCollection`, `deleteCollection`
- `createTag`, `updateTag`, `deleteTag`
- `signIn`, `signUp`, `sendVerifyEmail`, `changePassword`
- `uploadBlob`, etc.

## REST Endpoints (server)
- `/api/auth/sign-in`
- `/api/auth/sign-up`
- `/api/auth/magic-link`
- `/api/auth/oauth/*`
- Blob upload/download via presigned URLs

## Native Bridge (packages/frontend/mobile-native/)
Exposes via UniFFI:
- `NbStore` — local SQLite document store
- Crypto helpers
- Platform-specific utilities
