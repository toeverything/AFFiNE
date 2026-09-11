# План: enterprise-уровень доски (gap-анализ конкурентов + дорожная карта)

Этот документ — продолжение `plans/miro_whiteboard_implementation_plan.md`. Тот план закрывает **canvas/widgets** (chart, kanban, sketch, LOD, presence) — и, судя по коду, большая часть §6 там реально сделана. Этот документ разбирает другую ось: **чего не хватает, чтобы продукт продавался и работал как enterprise-инструмент** (SSO/SCIM, audit, DLP, facilitation, интеграции, AI-генерация, accessibility, мобильный офлайн) — по образцу Miro Enterprise Guard, Mural Enterprise, Figma/FigJam Enterprise, Lucid Enterprise Shield, Confluence Whiteboards.

**Метод.** Разобрано двумя параллельными потоками: (1) публичная документация конкурентов (Help Center / Trust Center / Developer Docs, актуальная на сентябрь 2026), (2) инвентаризация текущего кода `packages/backend/server`, `packages/frontend/admin`, `packages/frontend/core`, `packages/frontend/whiteboard`.

---

## Оглавление

1. [TL;DR](#1-tldr)
2. [Что уже есть в репозитории (инвентаризация)](#2-что-уже-есть-в-репозитории-инвентаризация)
3. [Конкуренты: что считается «enterprise-уровнем» в 2026](#3-конкуренты-что-считается-enterprise-уровнем-в-2026)
4. [Сравнительная матрица и приоритеты](#4-сравнительная-матрица-и-приоритеты)
5. [Функциональные блоки: что добавить/расширить](#5-функциональные-блоки-что-добавитьрасширить)
6. [Дорожная карта](#6-дорожная-карта)
7. [Архитектурные заметки по интеграции с текущим кодом](#7-архитектурные-заметки-по-интеграции-с-текущим-кодом)
8. [Риски и метрики](#8-риски-и-метрики)
9. [Чего не делать](#9-чего-не-делать)

---

## 1. TL;DR

Канвас (виджеты, LOD, presence, kanban, chart, sketch) — уже на уровне продуктового MVP+ и местами глубже, чем нужно для старта. **Разрыв с Miro/Mural/Figma/Lucid как с enterprise-продуктами — не в канвасе, а вокруг него**: identity (SAML/SCIM/MFA), governance (audit log, retention, DLP, data residency), facilitation (timer/voting/laser/private mode), экосистема (Slack/Jira/Teams, публичный SDK для виджетов), AI-генерация контента на доске, accessibility, паритет mobile/offline.

Рекомендация: не трогать архитектуру канваса (она соответствует §5 предыдущего плана). Вести **отдельный трек "Enterprise readiness"** параллельно с фазой 3–4 предыдущего плана, силами 1–2 бэкенд/платформенных инженеров + 1 фронтенд на admin console. Приоритет — identity/RBAC/audit (это блокер для любой enterprise-сделки), затем facilitation (дёшево и заметно пользователю), затем интеграции/AI/accessibility.

---

## 2. Что уже есть в репозитории (инвентаризация)

Сверено по коду (не по докам). Статусы: ✅ есть, 🟡 частично, ❌ нет.

### 2.1 Identity & доступ

| Возможность                                 | Статус | Где                                                                                                                              |
| ------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| OAuth Google/GitHub/Apple                   | ✅     | `packages/backend/server/src/plugins/oauth/config.ts`                                                                            |
| Generic OIDC провайдер                      | ✅     | тот же файл, `OAuthProviderName.OIDC`, issuer/claims настраиваемые                                                               |
| SAML 2.0                                    | ❌     | нет модуля                                                                                                                       |
| SCIM provisioning                           | ❌     | нет модуля                                                                                                                       |
| MFA / TOTP / WebAuthn                       | ❌     | только email + magic link + OAuth; `passkey` — заглушка в `packages/backend/native/.../auth_session/methods.rs` (`bound: false`) |
| Session policy (idle timeout, max duration) | 🟡     | JWT access/refresh TTL есть в `core/auth/config.ts`, но нет admin-настройки "session timeout"                                    |
| IP allowlist                                | ❌     | нет                                                                                                                              |

### 2.2 RBAC / права

| Возможность                                                     | Статус                 | Где                                                                                                        |
| --------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| WorkspaceRole (`External/Collaborator/Admin/Owner`)             | ✅                     | `packages/backend/server/src/models/common/role.ts`                                                        |
| DocRole (`None/External/Reader/Commenter/Editor/Manager/Owner`) | ✅                     | тот же файл, применяется в `core/permission/service.ts`                                                    |
| Block/object-level ACL на доске                                 | ❌ (сознательно не v1) | `packages/frontend/whiteboard/src/infra/permissions.ts` — только doc-readonly + `lockedBySelf` (soft lock) |
| Guest/domain restrictions                                       | ❌                     | нет allow/deny-листа доменов для шаринга наружу                                                            |

### 2.3 Admin console

`packages/frontend/admin/` — есть Dashboard (cloud usage), Accounts (CRUD, CSV import/export), Workspaces, Settings (Server/Auth/SMTP/Storage/OAuth/AI BYOK/Indexer — `packages/frontend/admin/src/modules/settings/config.ts`), About. **Нет**: audit log вкладки, security-policy вкладки (SSO/SCIM/MFA/сессии), billing внутри admin (платёж скрыт на self-host), content governance (classification, retention, eDiscovery).

### 2.4 Audit / compliance

Compliance-grade audit log **отсутствует**. Есть: doc version history (план-зависимая, 7/30 дней, `page-history-modal`), product-аналитика (`frontend/track/src/events.ts`, не для аудита), lifecycle-события MCP credentials. Нет GDPR-экспорта данных пользователя, нет retention policy на уровне организации, нет DLP/классификации контента, нет data residency (регион — это только выбор S3/R2 bucket, не juridical guarantee).

### 2.5 Feature flags (для справки, whiteboard)

`packages/frontend/core/src/modules/feature-flag/constant.ts`: `enable_whiteboard_hello` (default true), `enable_whiteboard_chart`, `enable_whiteboard_sketch`, `enable_board_widget`, `enable_whiteboard_perf_hud`, `enable_whiteboard_l0_layer`, `enable_whiteboard_collab` (все default false кроме hello). Механизм на месте — новые enterprise-флаги ложатся сюда же тем же способом.

### 2.6 Facilitation (внутри `packages/frontend/whiteboard/src/collab`)

Есть: follow-mode (viewport mirror, `collab-layer.ts`/`protocol.ts`), attention pulse "посмотри сюда" (`makeAttention`, TTL 5s), remote-курсоры (в т.ч. в sketch), comment pins (`comment-anchor.ts`), named versions (пока localStorage-подпись поверх history modal). **Нет**: таймер, голосование (dot voting), лазерная указка как отдельный от курсора инструмент, "приватный режим" (Mural-style — скрыть чужие стикеры до reveal), Summon/подтянуть всех к своему viewport (follow есть, но это подписка, а не принудительный teleport), presenter/breakout frames как продуктовая фича.

### 2.7 Интеграции, AI, шаблоны, поиск, mobile — коротко

- Интеграции: GraphQL API, MCP-сервер для AI-агентов (`plugins/copilot/mcp/`, `doc_search`/`read_document`), Readwise, Google Calendar, Google Drive embed. Slack — только URL unfurl. Jira/Teams/Zapier — нет. Публичного Web SDK для сторонних виджетов на доске — нет (только внутренний `registerGfxWidget`).
- AI: зрелый doc/edgeless copilot (`packages/frontend/core/src/blocksuite/ai/`, mind-map import, slides generation, doc-canvas-read для AI). На новых `wb:*` виджетах (chart/board/sketch) — AI-генерации нет.
- Шаблоны: есть галерея edgeless-шаблонов и стикеров (`packages/frontend/templates/`), но не under `wb:*` виджеты.
- Поиск: полнотекстовый, workspace-wide, embedded/Elasticsearch/Manticore (`admin/settings/config.ts`, `indexer`). Нет индексации объектов канваса (текст внутри chart/kanban/sketch) как первого гражданина поиска.
- Mobile/offline: нативные iOS/Android/Electron есть, offline-first через nbstore есть; edgeless-редактирование на мобильном — за экспериментальным флагом `enable_mobile_edgeless_editing`.
- Billing: полноценный Stripe/RevenueCat + self-hosted license, но не whiteboard-specific.

---

## 3. Конкуренты: что считается «enterprise-уровнем» в 2026

### 3.1 Miro (Enterprise Guard)

SAML SSO + SCIM (Okta/Entra/Google/OneLogin), audit log с настраиваемым retention 30/90/180/365 дней + Audit Log API + Splunk SIEM, data residency EU/US/AU/JP (отдельные датацентры, `workspacedomain.miro.com`). **Enterprise Guard** (доп. слой): автоматическая discovery и классификация чувствительных данных, real-time guardrails по чувствительности доски, retention/disposition policies, eDiscovery, управление ключами шифрования через AWS KMS. **Miro AI / Sidekicks**: генерация диаграмм (flowchart/ERD/UML/mindmap) из текстового промпта или из содержимого доски, конвертация фото диаграммы в редактируемую, контекстные AI-агенты с памятью и подключением к Slack/Jira/GitHub/Confluence, voice-режим. **Facilitation**: Presentation mode с таймером, голосованием, private mode, breakout frames, reactions, raise hand. **Developer platform**: Web SDK 2.0 (in-board apps), REST API, webhooks, Marketplace с ревью.

### 3.2 Mural

SSO/SAML, SCIM, 2FA, IP allowlisting, company dashboard с default permissions, guest-domain restrictions, session settings, Intune MAM. Сертификации SOC 2 Type 2, ISO 27001, ISO 42001, Microsoft 365; GDPR/CCPA. **BYOK-шифрование** (доп. опция), disclaimer banners, eDiscovery, audit logs + Splunk. Отличительная черта — **Facilitation Superpowers**: таймер, голосование, лазерная указка, **Private mode** (скрыть работу участников друг от друга до момента reveal — снижает groupthink), **Facilitator lock** (защита объектов от случайного перемещения), **Outline** (агенда, которая ведёт canvas по шагам), **Summon** (принудительно подтянуть viewport всех участников к текущему). Это то, что Miro не делает "из коробки" — конкурентное УТП именно в дисциплине воркшопа, а не в объёме canvas-примитивов.

### 3.3 Figma / FigJam

SAML SSO + SCIM (включая назначение типа места через SCIM — `figjamPermission`), Workspaces, billing groups, guest-контроль (approve/block, expiration в Governance+), enforced 2FA и multiple IdP в Governance+, разграничение organization-wide library/fonts/plugins, activity log + Activity Log API (Enterprise), запрет discovery файлов через search, restrict access to external content.

### 3.4 Lucid (Lucidchart/Lucidspark)

Domain control + verification, SAML, MFA через IdP, sharing restrictions, KMS (customer-managed encryption keys). **Enterprise Shield** (доп. security add-on, в т.ч. для FedRAMP): content inspection/классификация чувствительных данных, legal holds, retention policies, max session timeout (кастомизируемый, дефолт 30 дней), bulk revoke внешних шар, Discovery (полнотекстовый поиск + экспорт метаданных по всем документам аккаунта), SIEM/API.

### 3.5 Общий паттерн enterprise-уровня (across all)

1. **Identity**: SAML + SCIM + MFA — это billing-gate, без него enterprise-сделки не закрываются вообще, независимо от качества canvas.
2. **Audit + SIEM**: настраиваемый retention, экспорт в Splunk/аналог, API доступ к логам.
3. **Governance add-on** (Enterprise Guard / Shield / Governance+): классификация данных, DLP, retention/legal hold, bulk revoke, encryption key management (BYOK/KMS) — продаётся отдельно как upsell, не блокер входа, но дифференциатор для крупных сделок (финсектор, госсектор).
4. **Facilitation** — недорогая, но высоковидимая функциональность (таймер/голосование/private mode/lock) — по факту различает Miro/Mural между собой сильнее, чем canvas-фичи.
5. **AI, встроенный в canvas** — не чат сбоку, а генерация/трансформация объектов на холсте прямо из промпта, с контекстом из выделенных объектов и из внешних инструментов.
6. **Открытая платформа**: Web SDK + REST API + webhooks + marketplace с ревью — обязательный слой у всех четырёх.
7. **Accessibility** как формальный трек (WCAG 2.2 AA, ежегодный ACR/VPAT) — юридическое требование госзакупок и части enterprise RFP.

---

## 4. Сравнительная матрица и приоритеты

| Пилар                                   | Miro                            | Mural                 | Figma/FigJam             | Lucid               | **Mosaic/AFFiNE сейчас**                          | Приоритет      |
| --------------------------------------- | ------------------------------- | --------------------- | ------------------------ | ------------------- | ------------------------------------------------- | -------------- |
| SAML SSO                                | ✅                              | ✅                    | ✅                       | ✅                  | ❌ (только OAuth/OIDC)                            | **P0**         |
| SCIM                                    | ✅                              | ✅                    | ✅                       | ✅ (через IdP)      | ❌                                                | **P0**         |
| MFA/2FA (native)                        | via SSO                         | ✅                    | Governance+              | via SSO/IdP         | ❌                                                | **P0**         |
| Admin audit log + SIEM                  | ✅                              | ✅                    | ✅ (Activity Log API)    | ✅                  | ❌                                                | **P0**         |
| Workspace/Doc RBAC                      | ✅                              | ✅                    | ✅                       | ✅ (roles)          | ✅                                                | — (сила)       |
| Block/object-level права                | частично (board classification) | —                     | file/project/team levels | —                   | ❌ (сознательно)                                  | P2             |
| Data residency                          | ✅ (4 региона)                  | ✅                    | — (SOC2/regions)         | —                   | 🟡 (только выбор bucket)                          | P1             |
| DLP / классификация / retention         | Enterprise Guard                | ✅ (audit+еDiscovery) | —                        | Enterprise Shield   | ❌                                                | P1/P2 (add-on) |
| BYOK / KMS шифрование                   | ✅ (AWS KMS)                    | ✅ (add-on)           | —                        | ✅ (KMS)            | ❌                                                | P2             |
| Guest/domain restrictions               | ✅                              | ✅                    | ✅ (Governance+)         | ✅ (domain control) | ❌                                                | **P0/P1**      |
| Facilitation (timer/vote/laser/private) | ✅                              | ✅✅ (УТП)            | —                        | —                   | 🟡 (follow+attention)                             | **P0**         |
| AI-генерация объектов на канвасе        | ✅✅ (Sidekicks)                | AI-функции            | AI (FigJam AI)           | Lucid AI            | 🟡 (doc AI есть, canvas-widget нет)               | P1             |
| Публичный SDK/API/webhooks для доски    | ✅ (Web SDK 2.0)                | частично              | ✅                       | ✅                  | 🟡 (внутренний SDK §6.7, нет публичного/webhooks) | P1             |
| Marketplace сторонних виджетов          | ✅                              | частично              | ✅ (plugins)             | —                   | ❌                                                | P3             |
| Интеграции (Slack/Jira/Teams)           | ✅✅                            | ✅                    | ✅                       | ✅                  | ❌ (unfurl only)                                  | P1             |
| Accessibility WCAG 2.2 AA               | ✅ (аудит, ACR)                 | 🟡 (partial 2.1/2.2)  | —                        | —                   | ❌ (не измерялось)                                | P1             |
| Mobile edgeless паритет                 | ✅                              | ✅                    | ✅                       | ✅                  | 🟡 (эксперимент. флаг)                            | P2             |
| Поиск по объектам канваса               | 🟡                              | 🟡                    | ✅ (по файлам)           | ✅ (Discovery)      | ❌ (только текст доков)                           | P2             |
| Billing/seats granularity               | ✅                              | ✅                    | ✅ (billing groups)      | ✅                  | ✅                                                | — (сила)       |

Легенда приоритетов: **P0** — блокер входа в enterprise-сегмент; P1 — дифференциатор/частое требование RFP; P2 — расширение/добавочная ценность; P3 — экосистема, делать после product-market fit виджетов.

---

## 5. Функциональные блоки: что добавить/расширить

### 5.1 [P0] Identity: SAML SSO + SCIM + MFA

**Проблема.** Сейчас есть OAuth (Google/GitHub/Apple) и generic OIDC (`packages/backend/server/src/plugins/oauth/config.ts`), но нет SAML 2.0 (многие корпоративные IdP — ADFS, старые Okta/OneLogin интеграции — говорят только SAML) и нет SCIM (авто-провижининг/деprovisioning при увольнении — обязательное требование security review любого крупного клиента).

**Работы.**

1. Новый plugin `packages/backend/server/src/plugins/sso-saml/` по образцу `plugins/oauth`: `defineModuleConfig('samlSso', ...)` с per-workspace или per-domain конфигом (entityId, ACS URL, x.509 cert, claim mapping), библиотека `@node-saml/node-saml` или `samlify`.
2. SCIM v2 REST endpoint (`/scim/v2/Users`, `/scim/v2/Groups`) — Nest controller рядом с `core/auth/controller.ts`; токен-based auth (bearer token, генерируется в admin), маппинг на `WorkspaceRole`/приглашения. Поддержать минимум Okta + Entra ID + Google (это 3 IdP, о которые разбивается 90% enterprise RFP).
3. MFA: native TOTP (RFC 6238) как fallback независимо от SSO — `packages/backend/server/src/core/auth/` + `packages/backend/native` (уже есть заготовка `passkey`, довести WebAuthn до реального биндинга вместо `bound: false`).
4. Admin UI: новая вкладка "Security" в `packages/frontend/admin/src/modules/settings/` — включение SAML/SCIM, генерация SCIM-токена, enforce SSO по домену, enforce MFA, session max-duration.
5. Домен-based enforcement: пользователи с email на claimed-домене обязаны логиниться через SSO (аналог Figma "SAML SSO only applies to members... domain-matched").

**Оценка.** SAML core + admin toggle — 3–4 недели. SCIM (Users+Groups, 3 IdP) — 3–4 недели. MFA/WebAuthn — 2 недели. Итого ~2–2.5 месяца, 1 бэкенд-инженер full-time.

### 5.2 [P0] Admin audit log + SIEM export

**Проблема.** Нет ни одной таблицы/лога, фиксирующего "кто, когда, что" на уровне организации. Version history в доке ≠ audit log организации.

**Работы.**

1. Схема `AuditLogEvent` (Prisma): `id, workspaceId, actorId, actorType(user/system/scim), action, targetType, targetId, metadata(jsonb), ip, userAgent, createdAt`. Партиционировать по времени, если объём велик.
2. Список событий по образцу Miro (см. §3.1): смена ролей, включение/выключение SSO/SCIM/MFA, приглашение/удаление участника, изменение sharing-настроек (public link, editing-link), логины/логауты/failed logins, экспорт доски, удаление документа, изменение retention/DLP policy.
3. Emit-точки: обернуть существующие резолверы в `core/permission`, `core/auth`, `core/workspaces` — не переписывать бизнес-логику, добавить `this.auditLog.record(...)` после успешной мутации (аналог существующего `frontend/track/src/events.ts`, но server-side и персистентно).
4. Retention policy: настраиваемый в admin (30/90/180/365 дней, "неограниченно" — по решению, у Miro сейчас max 365).
5. GraphQL `auditLogs(workspaceId, filter, cursor)` + Admin UI таблица с фильтрами (аналог Accounts-модуля) + экспорт CSV.
6. SIEM: webhook/HTTP-forwarder событий в Splunk HEC / generic syslog — простой fan-out, не собственный SIEM.

**Оценка.** Схема + emit-точки для 15–20 базовых событий + Admin UI — 4–5 недель. SIEM forwarder — 1 неделя.

### 5.3 [P0] Guest / domain controls + расширенные sharing-политики

**Проблема.** Нет allow/deny-листа доменов для гостевого доступа, нет запрета публичных ссылок на уровне организации, нет "public link editing" toggle отдельно от "view".

**Работы.**

1. Модель `WorkspaceSecurityPolicy`: `allowedGuestDomains[]`, `blockPublicLinks`, `blockPublicEditLinks`, `requireSsoForDomain[]`, `sessionMaxDurationSec`.
2. Проверка в `core/permission/service.ts` при создании share-ссылки и при приглашении внешнего email.
3. Admin UI: секция "Sharing & guests" рядом с новой Security-вкладкой.

**Оценка.** 2 недели (в основном переиспользует существующие share-flow, `frontend/core/src/modules/share-menu/`).

### 5.4 [P0] Facilitation-инструменты на доске (timer, voting, private mode, laser, summon, lock)

**Проблема.** У Mural это главное УТП, у Miro — часть Presentation mode; в нашем `packages/frontend/whiteboard/src/collab` есть только follow+attention+cursors — фундамент (awareness-протокол) уже есть, не хватает продуктовых фич поверх него.

**Работы (расширение `collab/protocol.ts`, `collab-layer.ts`, `presence-bar.ts`):**

| Фича                                      | Модель                                                                                                                                                                                                                                                   | Где                                                                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Таймер                                    | Shared awareness-состояние `{ endsAt, paused, pausedRemaining }`, видно всем в комнате, звук/вспышка по истечении                                                                                                                                        | новый `collab/timer.ts`, кнопка в `presence-bar.ts`                                                                               |
| Голосование (dot voting)                  | Ephemeral doc-level структура: `votingSession { id, prompt, maxVotesPerUser, targets[], votes: Map<userId, targetId[]> }`; персистить в Yjs (не awareness — нужно пережить reload), TTL/явное завершение фасилитатором                                   | `collab/voting.ts`, UI-иконка "проголосовать" на каждом объекте при активной сессии                                               |
| Лазерная указка                           | Отдельный awareness-канал `laserPointer: {x,y,ts}` с TTL ~800ms и **другим** визуалом, чем обычный remote cursor (толще, цвет ведущего, fade-trail)                                                                                                      | расширить `collab/awareness.ts`, включается по хоткею/тулбару, не заменяет обычный курсор                                         |
| Private mode                              | Флаг сессии `privateMode: boolean` в doc; пока включён — не-фасилитаторские правки от каждого юзера рендерятся только у автора (просто скрыть чужие блоки в UI по `authorId` до `reveal`), сами данные всё равно едут по CRDT — reveal = снять UI-фильтр | новый `collab/private-mode.ts`; ВАЖНО: это UX-фича, не security (см. §9.4 предыдущего плана про "block-level ACL без шифрования") |
| Facilitator lock                          | Расширение существующего soft-lock (`lockedBySelf` в `infra/permissions.ts`) до object/frame-level "заблокировано фасилитатором", проверяется в `canEditBoardWidgets`                                                                                    | `infra/permissions.ts`                                                                                                            |
| Summon (принудительный teleport viewport) | В отличие от follow (подписка), summon — разовая команда всем в комнате "прыгнуть к viewport X" через awareness broadcast + one-shot camera animate                                                                                                      | `collab/protocol.ts`, кнопка "Bring everyone here"                                                                                |
| Presentation mode (frames/slides)         | Полноэкранный режим показа `affine:frame` по presentationIndex с таймером/голосованием/reactions поверх; в BlockSuite уже есть базовый toolbar (`blocksuite/affine/widgets/edgeless-toolbar`) — расширить, а не переписывать                             | `packages/frontend/whiteboard` presentation layer поверх существующего                                                            |

**Оценка.** Таймер — 1 неделя. Voting — 2 недели. Laser — 3–4 дня. Private mode — 1.5 недели. Facilitator lock — 3–4 дня. Summon — 3–4 дня. Presentation mode integration — 1.5 недели. Итого ~8 недель, 1 фронтенд-инженер, ставится под флаг `enable_whiteboard_facilitation`.

### 5.5 [P1] AI-генерация объектов на доске

**Проблема.** AI-copilot в репозитории (`packages/frontend/core/src/blocksuite/ai/`) силён для доков (chat, slides, mindmap import), но `wb:chart` / `wb:board` / `wb:sketch` не имеют AI-путей создания/трансформации — а это флагманская фича Miro Sidekicks/AI Diagram Generator.

**Работы.**

1. `wb:chart from prompt`: текстовый промпт → LLM возвращает `{ chartType, mapping, sanitized spec-фрагмент }` в пределах существующего allowlist из `blocks/chart/sanitize.ts` — **не** давать LLM писать сырой ECharts option, только выбор из enum + числовые поля, дальше через существующую санитизацию.
2. "AI: сделай диаграмму из этих стикеров" — переиспользовать существующий `doc_canvas_read` инструмент AI (уже читает edgeless) + новый output-adapter, который создаёт `wb:board`/`wb:chart`/shape+connector примитивы, а не текст.
3. "Summarize board" — тот же паттерн, что и Miro "сгруппировать стикеры по теме/сентименту": группировка через существующие shape/group примитивы surface, не новый blockType.
4. Использовать существующий AI BYOK контур (`admin/settings/config.ts` → `copilot.byok`) — не заводить отдельный провайдерный слой для whiteboard AI.

**Оценка.** MVP (chart-from-prompt + board-from-stickers) — 4–5 недель, зависит от команды AI (не платформенной команды канваса).

### 5.6 [P1] Интеграции и публичный SDK для сторонних виджетов

**Проблема.** Внутренний контракт (`registerGfxWidget`, слой 0/1 из §6.7 предыдущего плана) есть, публичного слоя 2 (iframe-виджеты третьих сторон) и webhooks нет; Slack/Jira/Teams — нет вообще (кроме unfurl).

**Работы.**

1. Webhooks: `doc.updated`, `board.widget.created`, `comment.created` — Nest module, конфигурация per-workspace (URL + secret для HMAC-подписи), аналог Miro `Create webhook subscription`.
2. Publish `@affine/whiteboard-sdk` slice 1 (типы из §6.7 плана) — сделать это раньше, чем закладывалось, т.к. это прямой запрос enterprise-клиентов с собственными internal tools.
3. Slack app (не только unfurl): "поделиться доской в канал", уведомление о комментарии/упоминании.
4. Jira/Linear: связывание карточки `wb:board` с issue (аналогично card comments — просто внешний `externalRef` property на row-block).
5. iframe plugin-виджеты (слой 2 из §6.7) — сознательно за этим треком, не раньше фазы 4 предыдущего плана.

**Оценка.** Webhooks — 2 недели. SDK publish (типизация + README + пример) — 2 недели. Slack app — 3 недели. Jira card linking — 2 недели.

### 5.7 [P1] Data residency + governance add-on (DLP/retention/BYOK)

**Проблема.** Сейчас регион — это только выбор S3/R2 endpoint в `storages` конфиге, нет юридической гарантии "весь трафик и compute в регионе X", нет retention/legal hold, нет BYOK.

**Работы (можно делать как платный add-on, не в базовом плане):**

1. Data residency: deployment-паттерн — отдельный namespace/регион на клиента (self-host уже даёт это бесплатно; для managed cloud — документировать deployment topology per region, не писать новый код).
2. Retention/legal hold: `WorkspaceRetentionPolicy { maxDocAgeAfterDelete, legalHold: boolean }`, хук в существующий blob/doc GC (`cleanupUnreferencedWorkspaceBlobs`, уже упомянут в предыдущем плане §6.8) — при legal hold пропускать GC для доски.
3. BYOK: интеграция с AWS KMS/GCP KMS для шифрования blob-хранилища per-workspace — расширение `storages` config, а не новый криптослой в приложении.
4. DLP/классификация — самая дорогая часть (у всех конкурентов это отдельный платный add-on с ML-классификацией контента). Рекомендация: не строить самим на первой итерации, а спроектировать **hook-точку** (`ContentClassifier` interface, вызываемый при сохранении блока), которую можно either не использовать, либо подключить сторонний DLP-провайдер по контракту.

**Оценка.** Retention/legal hold — 2 недели. BYOK KMS — 3–4 недели. DLP hook (без реализации классификатора) — 1 неделя. Полноценная DLP — отдельный проект, не оценивается здесь.

### 5.8 [P1] Accessibility (WCAG 2.2 AA)

**Проблема.** Ни у BlockSuite gfx, ни у новых `wb:*` виджетов нет заявленного уровня соответствия; конкуренты формально проходят ежегодный ACR/VPAT-аудит (юридически необходимо для gov/edu RFP).

**Работы.**

1. Базовый аудит текущего edgeless + трёх виджетов внешним инструментом (axe-core в Playwright) — включить в CI как non-blocking отчёт для начала.
2. Клавиатурная навигация по canvas-объектам (Tab/стрелки между top-level элементами, как у Miro "Explore board content") — новый keyboard-nav layer, не трогает hit-testing мышью.
3. `role`/`aria-label` на gfx-виджетах (у L0 WebGL-слоя уже есть `role="img"` + `aria-label` — расширить паттерн на L1/L2 DOM-версии chart/board/sketch).
4. Reduced motion setting (уже есть `enable_battery_save_mode` — близкий, но не тот же концепт; свести к предпочтению `prefers-reduced-motion`).
5. Alt-текст для sketch/chart snapshot-изображений.

**Оценка.** Аудит + отчёт — 1 неделя. Клавиатурная навигация MVP — 3 недели. ARIA-разметка виджетов — 2 недели. Итого ~6 недель, ongoing процесс дальше (не разовая задача).

### 5.9 [P2] Object-level права и content classification (board sensitivity)

**Проблема.** Miro вводит "board classification levels" (Confidential/Internal/Public), которые триггерят Guardrails. У нас нет даже базовой метки чувствительности документа.

**Работы.** Минимальная версия — не полноценный DLP: `sensitivityLabel` property на документе (enum, задаётся владельцем/админом), видна в шаринг-диалоге и в audit log; влияет только на one policy — "нельзя расшарить публичной ссылкой документ с меткой Confidential", если включён org-wide guardrail. Это дешёвая версия Miro Enterprise Guard "Protect".

**Оценка.** 2 недели.

### 5.10 [P2] Поиск по объектам канваса

**Проблема.** Полнотекстовый индекс сейчас — документо-центричный; текст внутри chart legend/kanban card/sketch text не является первым гражданином поиска отдельно от родительского дока.

**Работы.** Индексировать текстовые поля `wb:chart.title`, `wb:board` карточки (уже частично через `affine:database`, которая индексируется), `wb:sketch` text-элементы сцены — добавить extractors в существующий indexer pipeline (`packages/backend/server`, indexer provider abstraction уже поддерживает embedded/ES/Manticore).

**Оценка.** 2–3 недели.

### 5.11 [P2] Mobile/offline паритет для доски

**Проблема.** `enable_mobile_edgeless_editing` — экспериментальный флаг, LOD-политика (§5.4 предыдущего плана) считает бюджеты для десктопа, не для мобильных GPU/memory.

**Работы.** Отдельные (более консервативные) LOD-пороги и live-budgets для mobile viewport (`WHITEBOARD_LOD` уже параметризован в `const.ts` — добавить mobile-профиль), урезанный toolset на маленьком экране (create-only для chart/sketch, kanban — read+move card), touch-жесты для pan/zoom не конфликтующие с виджет-DnD.

**Оценка.** 4–5 недель, отдельно от desktop-трека.

### 5.12 [P3] Marketplace сторонних виджетов

Прямое продолжение §6.7 (слой 2–3) предыдущего плана. Начинать только после того, как внутренние виджеты (chart/board/sketch) реально используются продакшн-клиентами через собственный SDK-контракт — иначе некому ревьюить внешние заявки и не на чём валидировать контракт прав.

---

## 6. Дорожная карта

Трек ведётся **параллельно** фазам 2–4 предыдущего плана (коллаборация/масштаб/экосистема), не вместо них. Условные "спринты" по 2 недели.

### Трек Enterprise-0 — Identity & Governance foundation (10–12 недель)

- [ ] SAML SSO (core + 2–3 IdP пресета) — §5.1.1–5.1.2
- [ ] SCIM v2 (Users/Groups, Okta+Entra+Google) — §5.1.2
- [ ] MFA/WebAuthn (довести passkey-заготовку) — §5.1.3
- [ ] Admin "Security" вкладка (SSO/SCIM/MFA/session/guest-домены) — §5.1.4, §5.3
- [ ] Audit log схема + 15–20 событий + Admin UI + CSV export — §5.2
- [ ] Guest/domain policy + public link restrictions — §5.3

Демо-приёмка: подключить тестовый Okta-tenant, авто-провижининг пользователя через SCIM, залогиниться по SAML, увидеть событие в audit log, отозвать доступ через SCIM-деактивацию.

### Трек Enterprise-1 — Facilitation (8 недель, параллельно с Enterprise-0, другая команда)

- [ ] Таймер, voting, laser, facilitator lock, summon — §5.4
- [ ] Presentation mode поверх существующих frames — §5.4
- [ ] Private mode — §5.4

Демо-приёмка: воркшоп-сценарий — фасилитатор запускает таймер и voting, включает private mode на брейнсторме, затем reveal, лазером показывает область, summon подтягивает всех к kanban-доске.

### Трек Enterprise-2 — AI на канвасе + SDK/интеграции (8–10 недель)

- [ ] Chart-from-prompt, board-from-stickers — §5.5
- [ ] Webhooks + публикация `@affine/whiteboard-sdk` слоя 1 — §5.6
- [ ] Slack app (действия, не только unfurl) — §5.6
- [ ] Jira card linking — §5.6

### Трек Enterprise-3 — Governance add-on + accessibility (10–12 недель, может идти как отдельный "Enterprise Guard"-пакет)

- [ ] Sensitivity label + org-wide sharing guardrail — §5.9
- [ ] Retention/legal hold hook в blob GC — §5.7
- [ ] BYOK KMS для blob storage — §5.7
- [ ] DLP hook-интерфейс (без встроенного классификатора) — §5.7
- [ ] Accessibility: аудит + keyboard nav + ARIA на виджетах — §5.8

### Трек Enterprise-4 — Поиск по канвасу + mobile паритет (6–8 недель, низкий приоритет)

- [ ] Индексация текста widgets — §5.10
- [ ] Mobile LOD-профиль и touch UX — §5.11

### Позже (после product-market fit виджетов)

- [ ] Marketplace сторонних виджетов — §5.12

---

## 7. Архитектурные заметки по интеграции с текущим кодом

| Задача                                           | Точка расширения                                                                                                                                                 | Не трогать                                                   |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| SAML                                             | новый `plugins/sso-saml/` по образцу `plugins/oauth/config.ts` (`defineModuleConfig`)                                                                            | не переписывать существующий OAuth-провайдерный слой         |
| SCIM                                             | новый Nest controller рядом с `core/auth/controller.ts`; переиспользовать `WorkspaceRole` из `models/common/role.ts` для маппинга групп                          | не вводить параллельную модель ролей                         |
| MFA/WebAuthn                                     | `packages/backend/native/src/runtime/backend_runtime/auth_session/methods.rs` (заменить `bound:false` заглушку) + `core/auth`                                    | —                                                            |
| Admin Security tab                               | `packages/frontend/admin/src/modules/settings/config.ts` — новый `ConfigGroup`, паттерн идентичен существующим (`OAuth`, `AI BYOK`)                              | не создавать отдельное admin-приложение                      |
| Audit log                                        | новая Prisma-модель + emit-вызовы в существующих резолверах `core/permission`, `core/workspaces`, `core/auth`                                                    | не пытаться сделать retroactive audit по существующим данным |
| Facilitation (timer/voting/laser/private/summon) | `packages/frontend/whiteboard/src/collab/{protocol,collab-layer,presence-bar}.ts` — тот же awareness-канал `wbCollab`, что и у follow/attention                  | не заводить второй awareness-провод                          |
| Facilitator lock                                 | `packages/frontend/whiteboard/src/infra/permissions.ts` (`canEditBoardWidgets`) — расширить, не переписывать                                                     | —                                                            |
| AI chart/board from prompt                       | переиспользовать `doc_canvas_read` / AI tool layer из `packages/frontend/core/src/blocksuite/ai/`; выход прогонять через существующую `blocks/chart/sanitize.ts` | не давать LLM писать сырой ECharts option в обход sanitize   |
| Webhooks                                         | новый Nest module, независимый от GraphQL слоя, HMAC-подпись payload                                                                                             | —                                                            |
| Retention/legal hold                             | хук в существующий `cleanupUnreferencedWorkspaceBlobs` (упомянут в §6.8 предыдущего плана)                                                                       | не писать отдельный GC                                       |
| BYOK/KMS                                         | расширение `storages` module config (`admin/settings/config.ts`, blob.storage.config)                                                                            | не городить собственный crypto-слой в приложении             |
| Sensitivity label                                | property на doc-модели + проверка в `core/permission/service.ts` при создании share-ссылки                                                                       | —                                                            |
| Поиск по канвасу                                 | indexer provider abstraction, `admin/settings/config.ts` → `indexer`                                                                                             | —                                                            |

---

## 8. Риски и метрики

| Риск                                                                                                | Митигация                                                                                                           |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| SAML/SCIM — большой матрица IdP-специфичных багов (Okta/Entra/Google все по-разному трактуют спеку) | Начать с 2 IdP (Okta, Entra), остальные — по запросу первого клиента; e2e-тесты через SAML test-IdP (`samltest.id`) |
| Audit log раздувает БД                                                                              | Партиционирование по времени + настраиваемый retention с первого дня, не "добавим потом"                            |
| Facilitation features гонка jitter с существующими pointer/awareness (follow, attention)            | Общий throttle-слой и единый awareness namespace `wbCollab`, не отдельные каналы на фичу                            |
| AI-генерация объектов пишет невалидный/небезопасный spec                                            | Жёстко: LLM выбирает из enum/маппинга, не пишет сырой option — переиспользовать существующий sanitize               |
| DLP/BYOK — trap: клиенты ожидают "полный DLP", а сделан только hook                                 | Явно продавать как "hook + первый партнёр-классификатор", не обещать built-in ML-классификацию в v1                 |
| Accessibility становится вечным долгом без владельца                                                | Завести отдельный ongoing-процесс (как у Miro — PRAA перед каждым релизом), не разовый спринт                       |

**Метрики успеха трека:**

- Security review крупного enterprise-клиента (SSO+SCIM+audit+MFA) проходит без блокеров типа "нет SSO/SCIM" — сейчас это гарантированный blocker.
- Время прохождения vendor security questionnaire сокращается (наличие audit log + data residency ответа снимает 30–40% типовых вопросов SIG/CAIQ).
- Facilitation-фичи используются в ≥50% воркшопов с 3+ участниками (телеметрия `perf/telemetry.ts` уже собирает `live_collaborators` — расширить событиями timer/voting usage).
- 0 критичных findings в WCAG 2.2 AA автоаудите (axe-core) на core edgeless flow.

---

## 9. Чего не делать

1. Не переписывать identity-слой с нуля — расширять существующий `plugins/oauth` паттерном, а не заменять его.
2. Не делать собственный SIEM — только forwarder событий во внешние системы (Splunk HEC/generic webhook).
3. Не обещать полноценный ML-based DLP в первой итерации — только hook-интерфейс.
4. Не давать LLM прямой доступ к записи сырого ECharts option / произвольного HTML — только через существующий allowlist-sanitizer.
5. Не заводить второй awareness-протокол для facilitation-фич — использовать существующий `wbCollab` канал.
6. Не путать "block-level ACL" (не в v1, см. предыдущий план) с "sensitivity label + sharing guardrail" (дешёвая, полезная промежуточная мера) — это разные по стоимости вещи.
7. Не строить marketplace до того, как есть внешние клиенты, реально использующие SDK слой 1.
8. Не блокировать канвас-трек (chart/board/sketch фаза 2–4 предыдущего плана) ради enterprise-трека — вести параллельно, разными людьми.

---

_Источники сверки: код репозитория (`packages/backend/server`, `packages/frontend/admin`, `packages/frontend/core`, `packages/frontend/whiteboard`) по состоянию на сентябрь 2026; публичная документация Miro Help Center / Enterprise Guard, Mural Support/Trust & Security, Figma/FigJam Enterprise Help Center, Lucid Security/Enterprise Shield (актуальность — сентябрь 2026)._
