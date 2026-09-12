# План: clean-room backend Mosaic

Дата: 2026-09-12  
Связанные документы: `plans/enterprise_readiness_plan.md`, `plans/miro_whiteboard_implementation_plan.md`, `plans/miro_kanban_parity_plan.md`  
Цель: заменить EE-backend AFFiNE (`packages/backend/**`) собственным сервером под MIT/своей лицензией, сохранив совместимость с MIT frontend / BlockSuite / whiteboard.

---

## 0. Короткий вывод

Переписывать backend имеет смысл только как **clean-room**: не копировать Nest/Rust AFFiNE, а реализовать **контракты**, которые уже вызывает MIT-клиент (`@affine/graphql`, nbstore Socket.IO, несколько REST-путей).

Канвас и kanban живут в клиенте. Backend для Mosaic MVP — это:

1. Auth + workspace ACL
2. Надёжный **Yjs multiplayer sync**
3. Blobs (файлы/снимки chart/sketch)
4. Минимальный GraphQL bootstrap, чтобы UI не падал

AI, billing, license, Stripe, полный indexer — **не** MVP. Enterprise (SSO/SCIM/audit) — отдельный трек после стабильного sync.

**Не цель:** клонировать `packages/backend/native` и EE-лицензирование.  
**Цель:** свой продукт Mosaic Server с wire-compat там, где дешевле оставить текущий frontend.

---

## 1. Правовые и продуктовые рамки

| Правило        | Смысл                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------- |
| Clean-room     | Писать по наблюдаемым API клиента и спецификациям (Yjs, Socket.IO), не переносить EE-код |
| MIT остаётся   | `packages/frontend/**`, BlockSuite, `nbstore` client, GraphQL operations как _контракт_  |
| EE уходит      | `packages/backend/server`, `packages/backend/native`, payment/license                    |
| Seats          | В своём backend — своя модель квот (unlimited / org plan), без AFFiNE EE                 |
| Публичный форк | Не распространять модифицированный EE-backend; новый сервер — отдельный пакет/репо       |

Рекомендация по репозиторию: новый код в **`backend/`** (Phase 0: `@mosaic/server`, MIT). План изначально предлагал `packages/server`; корневой `backend/` выбран, чтобы не смешивать с yarn workspace и EE-пакетами. Старый `packages/backend` не трогать до cutover, затем удалить из дерева поставки.

---

## 2. Что оставить / заменить

| Оставить                                      | Заменить                              |
| --------------------------------------------- | ------------------------------------- |
| Frontend apps, whiteboard, BlockSuite         | NestJS server EE                      |
| Yjs client + `@affine/nbstore` cloud client   | Rust `BackendRuntime`                 |
| `@affine/graphql` документы (как контракт v1) | Prisma schema / entitlement / payment |
| Admin UI — позже адаптировать                 | License / Stripe / RevenueCat         |

---

## 3. Целевая архитектура (best practices)

### 3.1 Принципы

1. **Hexagonal / ports & adapters** — domain (Workspace, Doc, Blob, Membership) не знает HTTP/WS.
2. **API compatibility layer** — тонкий адаптер «AFFiNE GraphQL/Socket.IO shapes» над своим domain API; позже можно добавить «чистый» Mosaic REST/GraphQL v2.
3. **CRDT as source of truth for docs** — Postgres хранит snapshots + append-only updates; merge через проверенную библиотеку (yjs/y-octo или эквивалент), с тестами на concurrency.
4. **Idempotent writes** — push update с client clock / update id; дедуп.
5. **Least privilege ACL** — workspace role + doc role; все sync/blob через authorizer.
6. **Observability first** — structured logs, trace id на GraphQL + WS, метрики sync lag / update size / error rate.
7. **12-factor** — config via env, stateless app nodes, Redis для pub/sub и sessions.
8. **Migrations as code** — версионируемые SQL-миграции с нуля (не копировать EE schema 1:1; смоделировать нужные сущности).
9. **Security baseline** — Argon2id passwords, HttpOnly Secure cookies, CSRF strategy, rate limits, prepared statements, blob content-type sniffing + size caps.
10. **Feature flags** — server-side flags для постепенного cutover.

### 3.2 Рекомендуемый стек (прагматичный)

| Слой         | Выбор                                                     | Почему                                                  |
| ------------ | --------------------------------------------------------- | ------------------------------------------------------- |
| Language     | TypeScript (Node 22)                                      | Одна команда с frontend; быстрее MVP                    |
| HTTP         | Fastify или Hono                                          | Легче Nest для greenfield; меньше «магии»               |
| GraphQL      | GraphQL Yoga / Apollo                                     | Совместимость с существующими operations                |
| Realtime     | Socket.IO **или** чистый WS с адаптером под nbstore       | Клиент сейчас на Socket.IO — дешевле сохранить протокол |
| DB           | PostgreSQL 16                                             | Транзакции, JSON, позже pgvector                        |
| Cache/pubsub | Redis 7                                                   | Sessions, rate limit, WS fanout                         |
| Blobs        | S3-compatible + local FS для selfhost                     | Как у compose сейчас                                    |
| CRDT merge   | `yjs` на сервере (или `y-octo` через свой binding без EE) | Не тащить EE native                                     |
| Auth         | Session cookie + refresh rotation                         | Как ожидает frontend                                    |
| Jobs         | BullMQ / pg-boss                                          | Compact snapshots, GC blobs, mail                       |
| Deploy       | Docker Compose → позже K8s                                | Совпадает с текущим selfhost                            |

Альтернатива «Rust core + thin TS»: имеет смысл **после** стабилизации протоколов, если профилирование покажет bottleneck на merge. Не начинать с двух языков.

### 3.3 Логические сервисы

```
┌─────────────┐     GraphQL/REST      ┌──────────────────┐
│ MIT Client  │ ◄──────────────────► │ API Gateway      │
│ + nbstore   │     Socket.IO         │ (compat adapters)│
└─────────────┘                       └────────┬─────────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    ▼                          ▼                          ▼
              Identity & ACL              Doc Sync                   Blob Store
              (users, sessions,           (snapshots, updates,       (S3/FS + meta)
               workspaces, roles)          awareness, compact)
                    │                          │                          │
                    └──────────────────────────┴──────────────────────────┘
                                               ▼
                                         PostgreSQL + Redis
```

Опционально позже: Search, Notifications, AI Gateway, Audit — отдельные bounded contexts.

---

## 4. Контракты совместимости (источник правды для MVP)

Документировать в `packages/server/docs/compat.md` **до** кода: event names, payload shapes, GraphQL fields, cookie names.

### 4.1 Обязательный MVP wire surface

1. `GET /info`
2. GraphQL: `serverConfig`, `appConfig`, `currentUser`, `workspaces`, create workspace, members/invites (минимум)
3. Auth REST: login / logout / session refresh (пути, которые бьёт `@affine/core` cloud)
4. Socket.IO space protocol из nbstore: join / load-doc / push-doc-update / timestamps / awareness / broadcast
5. Blobs: create upload → complete → list/delete + binary GET
6. Doc REST, если клиент ходит за snapshot вне WS

### 4.2 Явно вне MVP

- Copilot / MCP / embeddings
- Payment, Stripe, license keys, seat enforcement AFFiNE
- Calendar, GCloud plugins
- Full-text indexer (можно заглушку «empty results»)
- Полный admin analytics

Заглушки GraphQL: возвращать безопасные default-значения / `null`, чтобы UI не падал, с логом `compat.stub`.

---

## 5. Модель данных (greenfield)

Минимальные таблицы (имена свои, не копия EE):

**Identity:** `users`, `credentials`, `sessions`, `oauth_accounts`  
**Tenancy:** `workspaces`, `workspace_members`, `invitations`  
**Docs:** `documents` (workspace_id, guid, meta), `doc_snapshots` (blob + clock), `doc_updates` (append-only), `doc_histories` (опционально v1.1)  
**Blobs:** `blobs` (key, size, hash, workspace_id, created_by)  
**ACL:** `doc_roles` (user/doc/role)  
**Config:** `instance_settings`

Индексы: `(workspace_id, guid)`, `(doc_id, clock)`, `(workspace_id, blob_key)`.  
Retention: job compact updates → snapshot каждые N updates / M MB.

---

## 6. Sync — критический путь

### 6.1 Инварианты

- Один logical document = один Y.Doc guid в workspace.
- Клиент шлёт updates; сервер persist + fanout другим участникам room.
- Snapshot = materialize state; load = snapshot ⊕ updates after clock.
- Awareness эфемерно (Redis pub/sub), не в Postgres.
- При `readonly` роли — reject push с typed error.

### 6.2 Тесты (обязательны до cutover)

1. Two-client concurrent edits → convergent state
2. Reconnect after offline → no data loss, no dup storms
3. Large update / many small updates → compact works
4. Permission deny on push
5. Room isolation (workspace A не видит B)
6. Chaos: kill server mid-push, retry idempotent

Инструмент: contract tests против записанных фикстур nbstore client (golden protocol).

---

## 7. Фазы реализации

### Phase 0 — Foundation (1–2 недели)

- [x] Репозиторий `backend/` (`@mosaic/server`; MIT на свой код). План предлагал `packages/server` — реализация в корневом `backend/` по решению продукта, чтобы не смешивать с EE workspace.
- [x] Compose: postgres + redis + server (`backend/docker-compose.yml`, аддитивный `docker-compose.mosaic.yml`; legacy `docker-compose.yml` не трогали до Phase 5)
- [x] Observability skeleton (pino + request/trace id + `/metrics`), health `GET /info` (+ `/health/live`, `/health/ready`)
- [x] Compat matrix: `backend/docs/compat-matrix.csv` + `backend/docs/compat.md`
- [x] ADR: `backend/docs/adr/0001-stack-and-clean-room.md`
- [x] 10 contract tests (`it.fails`) на MVP wire surface до GraphQL/auth/WS

**Exit:** пустой сервер поднимается, клиент видит `/info`. _(локально: `cd backend && npm run dev`; Docker в этой среде недоступен — compose проверен как файлы.)_

### Phase 1 — Auth + Workspaces (2–3 недели)

- [x] Register/login/session cookies (`affine_session`, `affine_user_id`, `affine_csrf_token`; CSRF on sign-out)
- [x] Create/list workspace, owner membership (`createWorkspace` / `workspaces` / `deleteWorkspace`)
- [x] GraphQL `currentUser` / `workspaces` parity (`POST /graphql`, `serverConfig`, quota stub, setup admin)
- [x] Rate limit + password hashing (Argon2id, `@fastify/rate-limit` + stricter auth routes)

**Exit:** UI логинится и открывает пустой cloud workspace (без sync ещё ок с ошибкой sync, либо local fallback). Реализация: `backend/` (`@mosaic/server`); Docker в этой среде недоступен — persistence по умолчанию in-memory, Postgres-адаптер и SQL-миграции есть.

### Phase 2 — Doc Sync MVP (4–6 недель) — главный риск

- [x] Socket.IO adapter под nbstore protocol (`/socket.io`, join/load/push/timestamps/delete/lifecycle, ack `{ error | data }`)
- [x] Persist snapshot/updates (memory + Postgres `002_docs`; Yjs validate-before-persist; SHA-256 idempotency)
- [x] Awareness (эфемерно в Socket.IO rooms; Redis pub/sub — при multi-instance)
- [x] ACL on join/push (workspace membership; userspace = `spaceId === user.id`)
- [x] Compact job (inline после `SYNC_COMPACT_UPDATES`, без Bull/Redis — Docker недоступен)

**Exit:** два браузера правят один doc/edgeless; whiteboard widgets сходятся. _(в этой среде: Socket.IO + Yjs suite в `backend/test/phase2`; UI не гонялся. Chaos kill-server аппроксимирован идемпотентным retry.)_

### Phase 3 — Blobs + Doc meta (2–3 недели)

- [x] Upload pipeline, FS/S3 (`createBlobUpload` → PUT `/api/blob-uploads/:token` → `completeBlobUpload`; multipart + `setBlob` fallback). Bytes: memory driver in tests, local FS (`BLOB_DIR`) for selfhost. S3 deferred (Docker недоступен).
- [x] GraphQL blob mutations/queries used by UI (`listBlobs`, `deleteBlob`, `releaseDeletedBlobs`, `workspace.quota`, part URLs)
- [x] Snapshot blobs for chart/sketch (PNG sniff + GET `/blobs/v1/:key` + source manifest)
- [x] Doc meta / history (`listHistory`, `recoverDoc`, GET `.../histories/:ts`; snapshot on compact)

**Exit:** вложения и виджетные снимки работают selfhost. _(в этой среде: `backend/test/phase3`; UI не гонялся.)_

### Phase 4 — Members, sharing, comments (2–4 недели)

- [x] Invites, roles Collaborator/Admin
- [x] Share link / public doc если нужно продукту
- [x] Comments если UI включён

**Exit:** команда до 10+ без искусственного seat lock (своя политика). Реализация: `backend/` (`inviteMembers` / `acceptInviteById` / invite links / `grantMember`; `publishDoc` + `GET /api/workspaces/:id/public-docs/:docId`; comments GraphQL + `ServerFeature.Comment`). Docker в этой среде недоступен — тесты на in-memory store (`backend/test/phase4`).

### Phase 5 — Cutover & delete EE (2 недели)

- [x] Feature flag `MOSAIC_SERVER=1` (`BUILD_CONFIG.isMosaicServer` + server `GET /info` feature `mosaic`; client same-origin, без Payment/Copilot)
- [x] E2E: login → create board → collab → blob → reload (`backend/test/phase5/cutover.e2e.test.ts`; in-memory, без Docker)
- [x] Убрать `packages/backend` из runtime images (`Dockerfile.from-source`, root `Dockerfile`, `.github/deployment/node/Dockerfile`; EE остаётся в git для yarn workspace)
- [x] Обновить `Dockerfile.from-source` / compose / CI (`docker-compose.yml` → Mosaic; dual-run `docker-compose.ee.yml`; `.github/workflows/mosaic-server.yml` + `build-images.yml`)

**Exit:** production image без EE-кода. _(в этой среде Docker недоступен — контракт образов в `backend/test/phase5/image-contract.test.ts`; локально `cd backend && npm test`.)_

### Phase 6 — Product platform (параллельно / после)

По приоритету из `enterprise_readiness_plan.md`:

1. [x] Audit log + admin security
2. [x] OIDC/SAML (не копировать EE)
3. [x] Search
4. [x] AI gateway (BYOK)
5. [x] Webhooks / Jira sync (kanban parity)

Реализация: `backend/` (`audit_events` + GraphQL `auditLogs` + CSV; `SecurityPolicy`; OIDC discovery + SAML ACS; query-time `workspace.search`/`searchDocs`; BYOK `MOSAIC_AI_API_KEY`; HMAC webhooks + Jira REST v3). Docker в этой среде недоступен — тесты на in-memory store и mock `HttpFetcher` (`backend/test/phase6`).

**Exit:** product-platform slice на clean-room сервере без EE. _(в этой среде: `cd backend && npm test`; UI/IdP live не гонялись.)_

---

## 8. Организация работ (best practices delivery)

| Практика            | Как                                                                        |
| ------------------- | -------------------------------------------------------------------------- |
| Contract-first      | Сначала `compat.md` + failing contract tests                               |
| Vertical slices     | Auth slice → Sync slice → Blob slice, не «все таблицы сразу»               |
| Dual-run            | Dev: старый server / новый server переключателем URL                       |
| Do not big-bang     | Cutover только после Phase 2–3 green                                       |
| Ownership           | 1 tech lead на sync; 1 на API/auth; frontend — только adapter bugs         |
| Definition of Done  | Contract test + load smoke (100 concurrent awareness) + security checklist |
| No EE contamination | Reviewers reject PRs that copy-paste from `packages/backend`               |

Оценка порядка величины (1 senior fullstack + 1 mid): **~3–5 месяцев** до selfhost MVP с collab; enterprise-слой — ещё квартал+.

---

## 9. Риски и митигации

| Риск                       | Митигация                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| Тихий рассинхрон протокола | Golden fixtures из реального nbstore traffic                                                       |
| Потеря данных CRDT         | Property tests + snapshot checksums + backups                                                      |
| Scope creep GraphQL        | Stub list; запрет «добавим Copilot заодно»                                                         |
| Performance merge          | Benchmark early; опциональный Rust later                                                           |
| Юридический                | Письменная clean-room policy; не читать EE при написании алгоритмов merge сверх публичных Yjs docs |
| Frontend drift             | Pin client version; compat suite в CI                                                              |

---

## 10. Чего не делать

1. Не патчить seats в EE и называть это «своим backend».
2. Не начинать с SSO/AI/billing.
3. Не копировать Prisma schema целиком «на всякий случай».
4. Не менять BlockSuite ради сервера — сервер подстраивается под client protocol.
5. Не делать multi-region в v1.
6. Не обещать Miro Jira two-way sync до стабильного sync core.

---

## 11. Метрики успеха MVP

- Sync convergence: 100% на concurrent-edit suite
- p95 push-to-fanout &lt; 100 ms в LAN
- Zero data-loss incidents в soak 24h (2 clients)
- Cold start workspace → editable board &lt; 3 s
- Image без `packages/backend`
- Своя лицензия на `packages/server`

---

## 12. Следующий конкретный шаг

1. [x] Создать `backend/` skeleton + compose override (`docker-compose.mosaic.yml`).
2. [x] Снять inventory: GraphQL ops / Socket.IO events / REST из MIT-клиента (`backend/docs/compat.md`, `compat-matrix.csv`). Полный proxy capture login → edgeless → blob — уточнение в Phase 1–2.
3. [x] Написать `compat.md` и 10 failing contract tests (`backend/test/contract`).
4. [x] Реализовать Phase 1 (Auth + Workspaces). Phase 0 выполнен.
5. [x] Реализовать Phase 2 (Doc Sync MVP) в `backend/`.
6. [x] Реализовать Phase 3 (Blobs + Doc meta) в `backend/`.
7. [x] Реализовать Phase 4 (Members, sharing, comments) в `backend/`.
8. [x] Реализовать Phase 5 (Cutover & delete EE) в `backend/` + runtime images/compose/CI.
9. [x] Реализовать Phase 6 (Product platform) в `backend/`. Далее — enterprise extras вне MIT wire (SCIM/MFA/admin UI) по отдельному плану.

После Phase 2 можно параллелить kanban/enterprise frontend, не блокируясь на EE seats.
