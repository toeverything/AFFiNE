# План реализации доски уровня Miro на AFFiNE / BlockSuite

Документ опирается на набросок `plans/global_plan.md`, на текущий код AFFiNE canary (BlockSuite 0.27.x), и на разбор Miro, Excalidraw, Yjs, Planka, ECharts, tldraw, Liveblocks, WeKan и соседних стеков.

**Рекомендация одной строкой:** не форкать BlockSuite и не собирать канвас с нуля. Строить продукт как слой расширений поверх AFFiNE: графики (ECharts), канбан как gfx-виджет на базе `affine:database`, рисунки Excalidraw как ограниченный блок, а не как вторая бесконечная доска. Синхронизацию, курсоры, историю, culling и turbo-renderer не переписывать.

---

## Оглавление

1. [Разбор наброска](#1-разбор-наброска)
2. [Что уже есть в репозитории](#2-что-уже-есть-в-репозитории)
3. [Анализ чужих решений](#3-анализ-чужих-решений)
4. [Стратегические варианты](#4-стратегические-варианты)
5. [Рекомендуемая архитектура](#5-рекомендуемая-архитектура)
6. [План по компонентам](#6-план-по-компонентам)
7. [Дорожная карта](#7-дорожная-карта)
8. [Данные, права, наблюдаемость, тесты](#8-данные-права-наблюдаемость-тесты)
9. [Риски, метрики, команда](#9-риски-метрики-команда)
10. [Чего не делать](#10-чего-не-делать)

---

## 1. Разбор наброска

Набросок в целом указывает верное направление (расширения, local-first, ECharts, viewport-culling, Plugin SDK). Часть формулировок устарела относительно текущего кода, часть переоценивает чужие продукты, часть предлагает строить то, что уже есть.

### 1.1 Что верно и нужно сохранить

| Тезис наброска | Оценка |
|---|---|
| Не форкать AFFiNE глубоко, строить на plugin/extension layer | Верно. Это единственный путь, совместимый с апстримом. |
| Ядро — BlockSuite store, UI продукта — React | Верно. Редактор — Lit, оболочка — React 19. |
| Всё состояние в Yjs, бэкенд хранит снапшоты + лог updates | Уже реализовано в `@affine/nbstore` + `SpaceSyncGateway`. |
| Awareness для курсоров и presence | Уже есть (`AwarenessStore.selectionV2`, Socket.IO awareness). |
| Чарт хранит spec + dataSource, не «голый JSON» в UI | Верно. Форма настроек обязательна. |
| Ленивая загрузка данных при входе во вьюпорт | Верно и критично. |
| Viewport-culling, виртуализация, SVG-фоллбек для тяжёлых виджетов | Верно по смыслу; culling уже есть, виртуализация канбана — нет. |
| Plugin SDK с первого дня как контракт, marketplace позже | Верно как принцип API; runtime-песочница — не MVP. |
| Права нельзя закрыть только клиентом: CRDT уходит всем, кто в комнате | Верно. ACL должен быть на уровне документа / фильтре updates, не «спрятать блок в UI». |
| E2E коллаборации — отдельная дисциплина (Playwright, 2+ сессии) | Верно. |
| Экспорт `.excalidraw` / PNG / SVG / Mermaid — дешёвая миграция | Верно как канал привлечения, не как ядро продукта. |

### 1.2 Что устарело или неточно

**`BlockSpec` больше не является API.** В текущем BlockSuite блок — это три независимых куска:

1. `defineBlockSchema` + `BlockSchemaExtension` (модель / Yjs-проекция)
2. `StoreExtensionProvider` (схема + адаптеры markdown/html/clipboard)
3. `ViewExtensionProvider` (Lit-view, slash-menu, tools, toolbar)

Регистрация в продукте — `StoreExtensionManager` / `ViewExtensionManager` в `@affine/core`:

- `packages/frontend/core/src/blocksuite/manager/store.ts`
- `packages/frontend/core/src/blocksuite/manager/view.ts`

Эталон: AI chat, PDF, TurboRenderer — они уже подключаются как product extensions без правки каждого пакета BlockSuite.

**Канбан уже есть**, но не как Planka. Это view `affine:database` (`@blocksuite/data-view`, `kanbanViewType`). DnD — `@atlaskit/pragmatic-drag-and-drop`, не dnd-kit. Swimlanes нет. Виртуализации колонок нет (у table-view есть `pc-virtual`, у kanban — нет).

**Planka не имеет swimlanes.** Иерархия Planka: `Project → Board → List → Card` (+ labels, members, due dates, checklists, attachments, comments). Swimlanes есть у WeKan, не у Planka. Набросок смешал две модели.

**Excalidraw уже вшит как iframe-embed** (`affine:embed-*`, провайдер `excalidraw.com`). Это не CRDT-native, не офлайн и не часть доски. Для продукта нужен другой уровень.

**Viewport-culling, GridManager, turbo-renderer уже есть.** Не строить заново:

- `GridManager` — пространственный индекс AABB
- `GfxViewportElement` — DOM-блоки вне вьюпорта переводятся в `idle`
- `CanvasRenderer._renderByBound` — cull примитивов
- `@blocksuite/affine-gfx-turbo-renderer` — off-thread bitmap лейаута при отдалении

**Комментарии уже есть** (`CommentViewExtension`, GraphQL threads, snapshot цели). Их надо привязать к новым gfx-блокам, а не писать с нуля.

**`schema-per-tenant` — лишняя сложность.** AFFiNE изолирует тенант через `workspaceId` в Postgres + комнаты Socket.IO. Prisma + schema-per-tenant ломает миграции. Оставляем workspace-isolation; RLS — отдельный этап, если появится compliance.

**dnd-kit не стоит тащить в MVP.** В дереве уже Atlaskit DnD, и он связан с data-view. Второй DnD-стек даст гонки жестов на одной доске.

### 1.3 Что в наброске опасно, если делать буквально

1. **«Форк AFFiNE → кастомные блоки».** Форк всего монорепо ради трёх блоков отрежет от апстрима. Нужен *shallow patch*: 2–3 строки регистрации в managers + собственные пакеты.
2. **Новый primitive в `elementsCtorMap`.** Карта примитивов (`shape`, `connector`, `brush`, `mindmap`…) захардкожена в surface. Chart / Kanban / Excalidraw должны быть **gfx-блоками** (`GfxCompatible(BlockModel)`), как `affine:frame`, а не новыми примитивами.
3. **PixiJS как замена канваса.** Miro использует PixiJS внутри своего рендерера. У нас уже есть canvas-renderer + turbo-renderer. Pixi оправдан только как *режим presentation zoom-out* (фаза 3), не как замена gfx.
4. **Блок-level RBAC без шифрования.** Клиент, получивший Y.Doc, видит все блоки. «Скрыть блок политикой на клиенте» — не безопасность. Сначала ACL на документ, затем либо E2EE-секции, либо серверная фильтрация updates (дорого и хрупко).
5. **Вложенная бесконечная доска Excalidraw.** Два viewport/zoom/pan на одном экране — UX-провал. Excalidraw живёт в **ограниченном прямоугольнике** на доске AFFiNE.

---

## 2. Что уже есть в репозитории

AFFiNE canary — это уже гибрид Notion + whiteboard, а не пустой редактор. Продуктовый разрыв с Miro — в **виджетах** (chart, native drawing, полноценный board-widget), **LOD для виджетов**, **SDK/marketplace**, а не в самом бесконечном канвасе.

### 2.1 Слои

```
React shell (@affine/web, @affine/core)     — навигация, workspace, share, AI, settings
        │
Lit editor (BlockStdScope, edgeless/page)
        │
BlockSuite affine (блоки, gfx, widgets)
        │
@blocksuite/store  ← Y.Doc / schemas / snapshots
@affine/nbstore    ← IndexedDB | SQLite | cloud (snapshot + updates)
        │
NestJS @affine/server  — GraphQL, Socket.IO SpaceSyncGateway, blobs, comments
        │
Postgres + Redis + native y-octo (компактификация)
```

### 2.2 Канвас (edgeless)

Дерево документа на доске:

```
affine:page
  affine:surface          ← Y.Map примитивов + gfx-дети
  affine:note             ← стикеры / контент страницы
    paragraph | list | database | ...
```

Два рода объектов:

| Род | Где живёт | Примеры | Вывод для нас |
|---|---|---|---|
| Surface child block | дерево блоков, parent `affine:surface` | frame, image, bookmark, attachment, embed-*, edgeless-text, note | **Chart / Kanban / Excalidraw — сюда** |
| Canvas primitive | `surface.props.elements` (`Y.Map`) | shape, connector, brush, text, mindmap, group, highlighter | Не трогать, кроме коннекторов *к* нашим блокам |

Ключевые файлы: `blocksuite/framework/std/src/gfx/{controller,viewport,grid,layer}.ts`, `blocksuite/affine/blocks/root/src/edgeless/edgeless-root-block.ts`, `blocksuite/affine/gfx/turbo-renderer`.

Зум: 0.1–6.0. Есть overscan. Есть adaptive-load при тяжёлых кадрах.

### 2.3 Готовые блоки, которые надо переиспользовать

| Возможность | Статус | Действие |
|---|---|---|
| Стикер / note | `affine:note`, `GfxCompatible` | Переиспользовать |
| Frame / секция | `affine:frame`, `childElementIds`, presentationIndex | Переиспользовать как Miro frames |
| Shape / connector / group | примитивы surface | Стрелки к chart/kanban получаются бесплатно, если блок gfx-совместим |
| Mindmap | примитив `mindmap` | Не дублировать |
| Brush / highlighter | примитивы | Базовый pen уже есть; Excalidraw нужен для «рисовалки с библиотекой» |
| Database table | `affine:database` | **Источник данных для графиков** |
| Kanban view | data-view `kanban` | MVP-канбан |
| Calendar view | data-view | Бонус |
| Embed iframe | в т.ч. Excalidraw.com | Временный fallback |
| Comments | модуль `@affine/core/modules/comment` | Привязать к новым flavour |
| Presence / remote selection | Awareness + widget remote-selection | Доработать follow-user |
| История документа | `createDocHistory`, nbstore histories | Поверх — named versions |
| PDF embed | `PdfViewExtension` | Шаблон Lit+React для панелей |

Чего нет: ECharts-блок, native Excalidraw, swimlanes, Plugin marketplace, module federation, песочница плагинов.

### 2.4 Как добавлять блок без форка

Пакет продукта (не внутри `blocksuite/affine/blocks/*`, если хотим жить рядом с апстримом):

```
packages/frontend/whiteboard/
  blocks/chart/
  blocks/excalidraw/
  blocks/kanban-board/      # только если database-view недостаточно
  sdk/                      # публичный контракт расширений
```

Каждый блок:

1. `defineBlockSchema` + `BlockSchemaExtension`
2. `StoreExtensionProvider.setup` → схема + адаптеры
3. Lit `GfxBlockComponent` + `effects()` (`customElements.define`)
4. `ViewExtensionProvider.setup` → `BlockViewExtension` + slash-menu + toolbar + tool
5. Регистрация в `getStoreManager()` / `getViewManager()`
6. Flavour в `SurfaceBlockSchema.metadata.children` (это **единственный** ожидаемый крошечный патч BlockSuite; либо parent = `affine:note` и перетаскивание на доску как у image)
7. `EdgelessClipboardConfig`, feature flag, turbo-renderer layout handler
8. Клиенты без схемы не откроют документ чисто — схема должна ехать вместе с приложением (и позже — с плагином)

---

## 3. Анализ чужих решений

### 3.1 Miro — продукт, к которому меряемся

Miro — не «канвас с фигурками». Это операционная система воркшопа: виджеты, facilitation, marketplace, LOD.

| Слой | Как у Miro | Что брать |
|---|---|---|
| Объекты | Stickers, frames, shapes, connectors, tables, kanban, charts, embeds | У AFFiNE уже есть 70% примитивов |
| Виджеты | Table / Timeline / Kanban на отдалении показывают **preview**, детали — при зуме и в вьюпорте | Обязательный паттерн для Chart и Kanban |
| Рендер | WebAssembly + PixiJS, vector/raster LoD, typed arrays для pen | Идея LOD; не копировать Pixi в MVP |
| Лимит | Рекомендуют ≤ 10 000 объектов на доску | Заложить бюджет: 2–3k интерактивных DOM/ECharts, остальное — bitmap/SVG |
| SDK | `miro.board.*` в iframe, панели, модалки, viewport, metadata, connectors. Embed/image дороже по rate limit | Контракт SDK проектировать по этой матрице, реализацию — поэтапно |
| Коллаб | Follow user, attention management, comments, voting | Follow + comments — фаза 2; voting — экосистема |
| Тяжёлые объекты | Hi-res images, PDF, vector pen, большие таблицы | Те же классы риска у нас: ECharts, Excalidraw, kanban с сотнями карточек |

Вывод: копировать надо **семантику виджетов и LOD**, не движок Pixi и не закрытый OT/сервер Miro.

### 3.2 Excalidraw — рисовалка, не операционка доски

- Лицензия MIT, сцена = массив `ExcalidrawElement`.
- Официальная коллаборация **не на Yjs**: Socket.IO relay + E2E-шифрование комнаты + Firebase persistence. Конфликты — `version` + `versionNonce` (LWW на элемент).
- Community-биндинг `y-excalidraw` кладёт элементы в `Y.Array`. Синк на уровне элемента, не ключа. Undo — отдельный `Y.UndoManager`.
- `onChange` отдаёт **весь** массив, не дифф. Для Yjs это значит: либо грубый replace элемента, либо собственный deep-diff.

Как встраивать:

| Уровень | Смысл | Когда |
|---|---|---|
| 0 | iframe `excalidraw.com` (уже есть) | Ссылки, не продукт |
| 1 | Gfx-блок, сцена в blob / `Boxed`, один live-инстанс на выделенный блок, остальные `exportToSvg` | **Продуктовый путь** |
| 2 | `y-excalidraw` на `Y.Array` в subdoc блока | Когда два человека рисуют *внутри одного* блока одновременно |
| 3 | Заменить gfx AFFiNE на Excalidraw | Не делать |

Excalidraw не заменяет mindmap, frames, database, connectors AFFiNE. Он закрывает «hand-drawn diagram in a frame».

### 3.3 Yjs — правильный фундамент *для этого* репозитория

Протокол: state vector → `Y.encodeStateAsUpdate` → инкрементальные updates. Awareness — отдельный ephemeral CRDT (клик 30s, heartbeat 15s): курсоры, selection, follow, pulsar «смотрю сюда». Не класть туда данные документа.

Компактификация: `Y.mergeUpdates` уменьшает оверхед сообщений, но **не удаляет tombstones**. Реальный выигрыш — периодический snapshot в новый doc (AFFiNE это уже делает через y-octo / Yjs apply-way). Важный комментарий в native-коде: y-octo merge **нельзя** слепо отдавать yjs-клиентам, пока не закрыт round-trip баг. Клиентские снапшоты — через Yjs.

Для больших досок:

- Не один гигантский `Y.Doc` на 50k объектов с толстыми ECharts option.
- Тяжёлые виджеты — **subdoc или blob**: страница держит ссылку (`blockId`, `blobId`, `subdocGuid`), тело подгружается при попадании в overscan.
- Карточки канбана — CRDT-узлы (уже: строки database = дочерние блоки). DnD двух пользователей = перемещение id между колонками, не «перезаписать всю доску».

Альтернативы Yjs, которые мы **не** берём как замену в этом репо:

| Движок | Сильная сторона | Почему не замена |
|---|---|---|
| Automerge / Loro | богатая история, хорош для текста | Другой runtime, нет Bindings в BlockSuite |
| ShareDB (OT) | проще для форм | Хуже офлайн |
| Replicache | server authority | Другая модель, не local-first AFFiNE |
| tldraw sync | идеален для shape-tree | Не CRDT, не совместим с BlockSuite store |
| Liveblocks | presence + comments из коробки | Vendor lock-in; Yjs у нас уже свой |
| Excalidraw LWW | достаточно для скетча | Недостаточно для текста/таблиц |

Вывод: **остаёмся на Yjs + nbstore**. Для Excalidraw-блока допустим гибрид: LWW на элемент внутри subdoc, страница — Yjs.

### 3.4 Planka — модель канбана, не движок

Стек Planka: React + Sails + Postgres, realtime по WebSocket, **не** CRDT. Истина на сервере. Офлайн-merge двух драгов карточки Planka не решает.

Модель, которую стоит взять *семантически*:

```
Board
  List (колонка, position)
    Card (name, description, dueDate, stopwatch, position)
      CardMembership[]
      CardLabel[]
      Task[]          ← чеклист
      Attachment[]
      Comment[]       ← у нас лучше внешний comment-модуль
  Label[]
  BoardMembership[]
```

Чего в Planka нет и что часто путают с «настоящим канбаном»: swimlanes, WIP limits, custom fields. Это WeKan / Jira.

В AFFiNE это почти изоморфно database:

| Planka | affine:database |
|---|---|
| Board | database block + kanban view |
| List | group-by колонка (select/status) |
| Card | дочерний блок-строка |
| Label | multi-select column |
| Member | property `member` (уже есть в `@affine/core` database columns) |
| Due | date column |
| Attachment | file column / blob |
| Checklist | linked sub-rows или JSON column — **дыры** |
| Swimlane | второй group-by (ось Y) — **дыры** |

Вывод: не портировать Planka. Взять поля карточки и UX колонок; хранение — database CRDT. Swimlanes — своя фича фазы 2.

### 3.5 ECharts — headless-рендерер, не блок

Правила встройки:

- Хранить **детерминированный JSON option** без функций (`formatter` как named preset, не `Function`). Иначе ни снапшот, ни SSR, ни sandbox.
- `renderer: 'canvas'` при > ~1k точек; `svg` — для экспорта и для малого числа инстансов на слабых устройствах.
- Большие серии: `large: true`, `progressive` / `progressiveThreshold`, для line — `sampling: 'lttb'`, `animation: false` на доске.
- `echarts.init` дорогой. Бюджет: **не больше N живых инстансов во вьюпорте** (стартовать с N=3). Остальные — последний `getDataURL` / `exportToSvg` / turbo bitmap.
- Данные не дублировать в option. Option = визуальная спека, data = `dataset` из dataSource в момент рендера.
- ScatterGL / WebGL — только для «миллион точек», отдельный флаг, не дефолт.

Альтернативы, которые хуже для доски:

- Recharts — уже в админке AFFiNE, SVG, не тянет large-mode.
- Chart.js — проще, беднее speka.
- Observable Plot / Vega-Lite — отличный grammar of graphics; Vega-Lite можно держать *как надмножество спеки* и компилировать в ECharts или в Vega. Имеет смысл как **уровень 2** редактора («поля → график»), не как первый рендерер.
- Observable / Plotly — тяжелее и лицензионно шумнее.

### 3.6 Другие решения, которые надо знать

**tldraw.** Лучший canvas SDK на React. Синк — `@tldraw/sync`, **сознательно не CRDT**, server-authoritative LWW на shape. Лицензия коммерческая (watermark без оплаты). Не заменяет BlockSuite: нет model документов, database, AFFiNE cloud. Имеет смысл как *вариант B* (см. §4), не как патч в canary.

**Liveblocks.** Presence/storage/Yjs hosted. AGPL-сервер для dev, production self-host не упакован. Имеет смысл, только если бросаем `@affine/server`.

**Penpot.** Дизайн (Figma-like), MPL, не whiteboard facilitation и не documents.

**CryptPad.** E2EE-доски. Паттерн шифрования комнаты — референс для «private board», не для основного продукта.

**draw.io / diagrams.net.** Структурные схемы, слабый realtime. Брать только как import (mxGraph XML → наши shapes) в экосистеме.

**WeKan.** Swimlanes + WIP. Референс UX для фазы 2 канбана.

**Figma / FigJam.** Multiplayer на операционном сервере, не local-first. Follow, cursor chat, widgets — UX-референс.

**Jointly / WBO / Nextcloud Whiteboard.** Слишком тонкие, чтобы на них строить продукт.

---

## 4. Стратегические варианты

Ниже — реальные развилки, а не «ещё один список библиотек». Рекомендуется **вариант A**. Остальные — осознанные развилки, если изменятся цели (лицензия, скорость канваса, отказ от документов).

### Вариант A — AFFiNE как OS, виджеты как extensions (рекомендуется)

Продукт = AFFiNE canary + пакет `@affine/whiteboard` с тремя gfx-блоками и тонким SDK.

- Плюсы: local-first и cloud уже есть; документы + доска в одном CRDT; апстрим жив; канбан и frames бесплатно; команда пишет продуктовый слой, не синк.
- Минусы: gfx AFFiNE слабее tldraw/Miro на 10k+ шейпов; Lit+React двойной стек; surface children whitelist придётся патчить.
- Срок до честного MVP: 2–3 месяца (chart + kanban-on-board + SVG-excalidraw).
- Когда выбирать: цель — Miro-подобный *workspace* (доска + доки + база + cloud), self-host, без смены лицензии ядра.

### Вариант B — Гибрид: AFFiNE документы + tldraw canvas

Страница остаётся BlockSuite. «Доска» — tldraw-сцена, встроенная как один блок или как отдельный doc-type. Синк сцены — tldraw sync (Durable Object / собственный WS), документы — Yjs.

- Плюсы: лучший pen/shape UX, готовый follow-user, commenting package.
- Минусы: **два мира синхронизации**, два undo, две модели прав, коммерческая лицензия tldraw, сложный импорт/экспорт, стикеры-документы AFFiNE не являются tldraw shapes.
- Когда выбирать: ставка на «лучшая в мире рисовалка», документы вторичны. Для текущего репозитория — дорогая политическая развилка.

### Вариант C — BlockSuite-only продукт без оболочки AFFiNE

Свой shell (навигация, auth), редактор = `@blocksuite/affine` + свои extensions. Синк — либо свой y-websocket, либо вырезанный nbstore.

- Плюсы: полный контроль UX, нет «ещё и Notion».
- Минусы: повторно пишем workspace, share, blobs, billing, mobile, admin. 6–12 месяцев до паритета оболочки.
- Когда выбирать: бренд «чистый Miro», AFFiNE UI мешает. Не первый шаг.

### Вариант D — Тот же store, другой renderer (Pixi / WebGL LOD)

Модель остаётся Yjs/BlockSuite. При зуме < порога gfx-view не монтирует DOM/ECharts, а рисует слой PixiJS/WebGL из AABB + превью-текстур. Это эволюция варианта A, не альтернатива ядру.

- Плюсы: путь к 10k+ объектов, как у Miro.
- Минусы: второй renderer, hit-testing, селекция, a11y. Имеет смысл **после** того, как виджеты и culling исчерпаны.
- Когда: фаза «масштабирование», KPI не выполняется (FPS < 45 на 3k объектов).

### Вариант E — Greenfield (Yjs + Pixi + свой editor)

18–36 месяцев до паритета с тем, что уже лежит в canary. Отвергаем, пока не доказано, что BlockSuite gfx принципиально не масштабируется даже с LOD (вариант D).

### Вариант F — «Miro-lite» без документов

Только edgeless, спрятать page-mode. Технически это флаги UI варианта A. Имеет смысл как **скин** (режим Board-first), не как отдельный стек. Рекомендуется сделать переключатель: «Документ / Доска / Гибрид».

**Итог выбора:** A сейчас, D когда упрёмся в FPS, F как UX-оболочка. B — только если лицензия tldraw приемлема и рисование важнее базы/доков. C/E не начинать.

---

## 5. Рекомендуемая архитектура

### 5.1 Принципы

1. **Один документ = одна доска или страница.** Не плодить «доска как отдельный микросервис».
2. **Виджет = gfx-блок со стабильным flavour.** Flavour вида `wb:chart`, `wb:sketch`, чтобы не столкнуться с будущим `affine:chart` апстрима. Адаптер на `affine:*` заложить сразу.
3. **Спека отдельно от данных.** Chart spec — JSON в props; rows — database / blob / URL.
4. **Live только у фокуса.** Невыделенные тяжёлые виджеты — snapshot (SVG/PNG) + turbo-renderer.
5. **Subdoc/blob для толстых тел.** Страница знает id и xywh; 2 МБ option ECharts не живут в каждом update страницы.
6. **Контракт SDK с дня 1, runtime marketplace — с фазы 4.** Сначала внутренние extensions с теми же хуками, что отдадим наружу.
7. **Права на документ и комнату, не на «видимость блока в React».**

### 5.2 Целевой граф пакетов

```
@affine/whiteboard                  публичный вход
  @affine/whiteboard-chart          схема + Lit view + React settings panel
  @affine/whiteboard-sketch         Excalidraw gfx-block
  @affine/whiteboard-board          kanban-on-surface (обёртка database)
  @affine/whiteboard-sdk            типы: registerBlock, registerTool, registerPanel, events
  @affine/whiteboard-perf           viewport policy, instance budget, snapshot cache
```

Регистрация — рядом с `AIViewExtension` / `PdfViewExtension`. Feature flags: `enableWhiteboardChart`, `enableWhiteboardSketch`, `enableBoardWidget`.

### 5.3 Состояние и синк (без нового протокола)

```
UI action
  → BlockSuite command / model.props
    → Yjs transaction (origin = local)
      → nbstore persist (IDB / SQLite)
      → Socket.IO space:push-doc-update
        → server append log + broadcast
        → periodic compact → snapshot
Awareness
  → cursor, selection, followTarget, camera (опционально, throttled)
  → не persist
Blobs
  → PNG/SVG snapshots, CSV, excalidraw assets, chart caches
```

Для sketch-блока с concurrent drawing: subdoc `Y.Doc` на блок, `Y.Array<ExcalidrawElement>` (или готовый `y-excalidraw`), awareness локальный к subdoc.

### 5.4 LOD — три уровня детализации (обязательная политика)

| Уровень | Условие | Chart | Kanban | Sketch |
|---|---|---|---|---|
| L0 bitmap | zoom < z0 или вне overscan | картинка / turbo layer | карточки-прямоугольники | `exportToSvg` rasterized |
| L1 light DOM | в вьюпорте, не selected | SVG без tooltip | виртуальные колонки, без drag | SVG, hit-area на рамку |
| L2 live | selected **или** hover+zoom > z1 | `echarts.init` | полный DnD + редактирование | `@excalidraw/excalidraw` |

Пороги (стартовые, потом телеметрия): `z0 = 0.35`, `z1 = 0.7`, `maxLiveCharts = 3`, `maxLiveSketches = 1`, `maxLiveKanban = 2`.

### 5.5 Поток данных графика

```
affine:database (или blob CSV / HTTP)
        │  mapping: x, y, series, filter
        ▼
ChartDataService (подписка на Yjs observe / fetch)
        │  нормализация в dataset[]
        ▼
spec (ECharts option без dataset) + dataset
        ▼
Renderer: live | svg-snapshot | turbo-bitmap
```

Редактор спеки — React-панель (как Miro: слева/справа), не JSON. JSON — advanced tab.

---

## 6. План по компонентам

Каждый подраздел: цель, модель данных, UI, коллаборация, производительность, файлы, критерии готовности, оценка.

### 6.1 Каркас расширений и пакет `@affine/whiteboard`

**Цель.** С первого спринта любой новый виджет регистрируется одинаково. Это и есть зародыш SDK.

**Статус.** Выполнено.

**Работы.**

1. [x] Пакет `packages/frontend/whiteboard` в yarn workspaces.
2. [x] Базовые классы: `WhiteboardStoreExtension`, `WhiteboardViewExtension`.
3. [x] Feature flags в существующем `FeatureFlagStoreExtension` (`enable_whiteboard_hello`, `enable_whiteboard_chart`, `enable_whiteboard_sketch`, `enable_board_widget`).
4. [x] Хелпер `registerGfxWidget({ flavour, schema, view, slash, toolbar, clipboard, snapshotPainter })`.
5. [x] Документ `packages/frontend/whiteboard/README.md` — как добавить виджет за 1 день (копия latex, но с GfxCompatible).
6. [x] Патч `SurfaceBlockSchema.metadata.children` (или contrib upstream): добавить `wb:*`, `wb:hello`, `wb:chart`, `wb:sketch`, `wb:board`.
7. [x] Preview-scope (`preview-edgeless`) — только snapshot, без live-библиотек.

**Критерий.** Пустой виджет-заглушка (`wb:hello`) ставится из slash-menu на доску, синхронится двум клиентам, копируется, переживает reload.

**Оценка.** 1 неделя.

### 6.2 Chart-блок (ECharts)

**Цель.** Виджет графика на доске, связанный с таблицей документа, с панелью настроек уровня Miro, а не «JSON в пропах».

**Схема.**

```ts
flavour: 'wb:chart'
props: {
  xywh: string
  index: string
  rotate: number
  lockedBySelf?: boolean
  title: Text
  chartType: 'bar' | 'line' | 'area' | 'pie' | 'scatter' | 'funnel' | 'radar' | 'heatmap'
  spec: Boxed<SanitizedEChartsOption>   // без функций
  dataSource: Boxed<{
    type: 'database' | 'inline' | 'csv-blob' | 'http'
    docId?: string
    blockId?: string          // affine:database
    viewId?: string           // какая view/filter
    mapping: { x: string; y: string[]; series?: string; category?: string }
    refreshMs?: number        // для http
  }>
  snapshotBlobId?: string
  liveBudgetExempt?: boolean  // только для презентации
}
parent: ['affine:surface', 'affine:note']
```

**Санитизация option.** Allowlist ключей ECharts. Запрет `Function`, `js` formatter, произвольный HTML в tooltip. Preset-форматтеры: `number`, `percent`, `compact`, `date`. Тема — из `AffineThemeViewExtension`.

**UI.**

- На доске: рамка, title, chart/snapshot, resize как у frame.
- При выделении: правая панель React (`reactToLit`, как PDF): тип графика, оси, series, цвета, легенда, data labels, dataSource picker (список database в документе / другом doc).
- Slash-menu: «Chart», «Chart from table».
- Коннекторы: стандартные, якорь = Bound блока.

**Данные.**

- `database`: подписка на cells/columns; debounce 100–200ms; не писать агрегаты обратно в Yjs (считать на клиенте), кроме явно сохранённых pinned-aggregates.
- `inline`: маленькая таблица в props (до ~200 ячеек).
- `csv-blob`: blob store AFFiNE.
- `http`: только если allowlist домена + CORS; кэш в blob; офлайн показывает last snapshot + баннер.

**Производительность.**

- Intersection с `overscanBlockBounds` → schedule init.
- Dispose при idle.
- После каждого стабильного render (raf debounce 1s) — `getDataURL({ pixelRatio: 2 })` → blob snapshot.
- Turbo-renderer painter: рисует snapshot texture.
- `animation: false` по умолчанию на доске; animation только в L2 и если точек < 2k.

**Коллаборация.** Спека — Yjs (last-write-wins на ключах Boxed object — BlockSuite reactive). Конфликт «один меняет цвет, другой тип» приемлем как LWW. Данные живут в database — конфликты там уже решены. Не синкать echarts instance.

**Экспорт.** PNG/SVG из ECharts; копирование блока; HTML adapter — `<figure>`.

**Тесты.**

- Unit: sanitize option, mapping database → dataset.
- Playwright: два клиента, один меняет тип, второй видит; отключение сети, правка, reconnect.
- Perf: 20 графиков на доске, 3 в вьюпорте — не больше 3 `echarts.init`.

**Оценка.** 4–5 недель до MVP (bar/line/pie + database source + snapshot). Ещё 2 недели — scatter/funnel/radar + http + advanced JSON.

### 6.3 Канбан

Делается **в три подэтапа**. Не начинать с «нового Planka на dnd-kit».

#### 6.3.1 MVP — database kanban на доске

**Цель.** Канбан как объект доски за недели, не месяцы.

- Позволить `affine:database` быть gfx-совместимым **или** сделать тонкую обёртку `wb:board`, внутри которой живёт существующий database model (предпочтительно обёртка: не ломаем page-mode).
- Обёртка: `xywh`, title, `linkedDocId` + `blockId` (database может жить в том же doc в скрытом note-hub — паттерн «data layer»).
- Дефолтный view = kanban. Шаблоны: «To do / In progress / Done», «Project tracking» (в репо уже есть `templates/edgeless/Project Tracking Kanban.json`).
- Карточка: title, status, assignee, due, labels, cover — то, что уже умеет data-view.
- Открытие карточки — peek-view AFFiNE (уже есть `PeekViewService`), не модалка Planka.

**Критерий.** С доски: создать board, добавить карточку, перетащить между колонками, второй пользователь видит порядок без моргания всей доски.

**Оценка.** 2–3 недели.

#### 6.3.2 Виртуализация и LOD канбана

Скопировать идеи `data-view/.../table/pc-virtual/` на колонки и карточки.

- Виртуализировать карточки внутри колонки (TanStack Virtual допустим, либо тот же кастом, что у table).
- L0: цветные столбцы + счётчики.
- L1: первые N карточек + «+42».
- L2: полный DnD. Atlaskit оставить.
- Не больше `maxLiveKanban` полных досок.

**Оценка.** 2 недели.

#### 6.3.3 Planka-семантика и swimlanes

Добавить в data-view / board-widget, не отдельным сервером:

| Фича | Реализация |
|---|---|
| Чеклист | дочерние paragraph/list в карточке **или** колонка `tasks: {text, done}[]` в cells |
| WIP limit на колонку | поле в view meta, подсветка превышения |
| Swimlanes | второй group-by (ось Y). Модель: `groupBy: { x: status, y: assignee }`. DnD = смена двух свойств |
| Stopwatch / time spent | number/date columns + UI |
| Card comments | существующий comment-модуль, якорь = blockId строки |
| Attachments | file property |
| Filters / members | уже есть в data-view, довести UX до Trello |

**Критерий swimlanes.** Карточка принадлежит клетке (колонка × дорожка); два пользователя могут одновременно тащить разные карточки; конфликт одной карточки = LWW порядка + CRDT свойств.

**Оценка.** 3–4 недели после MVP.

**Почему не dnd-kit.** На одной edgeless-доске уже жесты gfx (pan, select, brush) + Atlaskit внутри database. Третий pointer-stack гарантирует баги «drag карточки двигает всю доску». Если Atlaskit упрётся в multi-container swimlanes — тогда точечно заменить *внутри* data-view, не вводить dnd-kit параллельно.

### 6.4 Excalidraw / sketch-блок

**Цель.** Hand-drawn диаграмма *внутри рамки* на доске AFFiNE, офлайн, с экспортом `.excalidraw`.

**Не цель.** Заменить shapes/brush/mindmap AFFiNE.

**Схема.**

```ts
flavour: 'wb:sketch'
props: {
  xywh, index, rotate, lockedBySelf
  title: Text
  sceneBlobId: string            // .excalidraw json gzip
  assets: Boxed<Record<fileId, blobId>>
  revision: number               // для snapshot invalidation
  snapshotSvgBlobId?: string
}
```

Для concurrent in-widget editing (фаза 2): `subdocGuid` вместо blob, `Y.Array` элементов.

**UI / LOD.** Как в §5.4. Интерактивный `@excalidraw/excalidraw` только у selected. Двойной клик входит в «edit sketch» (lock pan доски, как у Miro embed). Esc / клик снаружи — выход, экспорт SVG в blob.

**Коллаборация.**

- Фаза 1: blob replace + `revision` LWW. Два художника в одном блоке будут конфликтовать грубо — приемлемо, если UX показывает «сейчас рисует N».
- Фаза 2: `y-excalidraw` subdoc, awareness курсоров *внутри* скетча (иначе курсоры только на рамке).

**Жесты.** В edit-mode gfx-tools доски отключены (`ToolController` → lock). Колёсико внутри скетча зумит скетч, снаружи — доску. Это отдельный тест.

**Импорт/экспорт.** `.excalidraw`, PNG, SVG, clipboard. Mermaid → сначала в native AFFiNE (уже есть preview), опционально «mermaid to sketch» позже.

**Оценка.** Фаза 1: 3 недели. Фаза 2 (Yjs binding): 2–3 недели.

### 6.5 Производительность канваса

Не новый движок. Политика поверх существующего gfx.

**Работы.**

1. `WhiteboardPerfPolicy` extension: бюджеты live-инстансов, z-пороги, приоритет selected > hover > center-of-viewport.
2. Общий `SnapshotCache` (blob id → object URL, LRU по памяти).
3. Подключить snapshot painter к `ViewportTurboRendererExtension` (в коде уже есть комментарии про layout handler + painter worker).
4. Виртуализация канбана (§6.3.2).
5. Телеметрия: `frame_time`, `live_widget_count`, `cull_ratio`, `ws_rtt`.
6. Stress-фикстуры: 1k notes, 50 charts-as-snapshots, 5 live charts, 1 sketch.

**Фаза D (только если KPI не бьётся):** Pixi/WebGL layer для L0 всей доски. Отдельный RFC, не смешивать с MVP.

**Критерии.**

- 1080p, Chrome, 2k объектов (notes+shapes), 0 live ECharts: pan 55+ fps.
- 20 chart-виджетов, 3 live: взаимодействие с выбранным графиком < 100ms до tooltip.
- Первичная загрузка доски 5 МБ snapshot+updates < 3s до first interactive на 50 Мбит.

**Оценка фазы 1 политик:** 2 недели. Pixi: 6–10 недель, отдельный этап.

### 6.6 Коллаборация: presence, follow, комментарии, версии

Уже есть: awareness, remote selection, comments, doc history. Дыры относительно Miro:

| Фича | Сейчас | План |
|---|---|---|
| Курсоры | selectionV2 | Добавить pointer xy на surface + имя/цвет (throttle 30–50ms) |
| Follow user | нет как продукт | Awareness `followClientId` + подписка viewport; кнопка на аватаре |
| Attention / «посмотри сюда» | нет | Краткий pulse Bound в awareness, 5s TTL |
| Comments на gfx-блоке | комментарии документа/селекции | Якорь `{ blockId, point? }` для chart/kanban/sketch; pin на канвасе |
| Card comments | — | commentId на row block |
| Undo per-user | Y.UndoManager в редакторе | Не делать shared undo; оставить per-client. Для sketch subdoc — свой UndoManager |
| Named versions | histories | UI «Version restore» + snapshot label; не branch/merge как git |
| Presence в виджете | нет | L2-виджет пишет `editingFlavour+blockId` в awareness, чтобы не открывать второй live-editor |

**Оценка.** Presence+follow: 2 недели. Comments pins: 2 недели. Named versions UI: 1 неделя.

### 6.7 Plugin SDK и будущий marketplace

Miro выигрывает экосистемой. У AFFiNE в README до сих пор «plugin community coming soon». Сделать контракт сразу, runtime — поздно.

**Слой 0 (сейчас, внутренний).** То, чем мы сами регистрируем chart/kanban/sketch. Документировать.

**Слой 1 — публичный typed SDK (`@affine/whiteboard-sdk`).**

```ts
interface WhiteboardPlugin {
  manifest: { id, name, version, permissions[] }
  setup(ctx: PluginContext): void
}

interface PluginContext {
  registerBlock(spec: GfxBlockRegistration)
  registerTool(tool: BaseTool)
  registerSlashItem(item)
  registerToolbarButton(item)
  registerPanel(id, ReactRenderer)
  registerContextMenu(item)
  on(event: 'doc:update' | 'selection:change' | 'viewport:change', cb)
  board: {
    getViewport(), zoomTo(ids), createBlock(), updateProps(), getSelection()
  }
}
```

События — обёртка над store slots / Yjs, не отдельная шина-велосипед.

**Слой 2 — виджеты третьих сторон в iframe.** Как Miro: плагин не получает Y.Doc. `postMessage` + structured clone. Host проксирует `board.*` после проверки permissions. Сам плагин — gfx-блок `wb:plugin-widget` с `appId` + `metadata`. Sandbox: `iframe sandbox="allow-scripts"`, отдельный origin (plugin-cdn).

SES/compartments — исследование фазы 4, не блокер. Web Worker — для чистой логики (агрегации данных), не для UI.

**Слой 3 — marketplace.** Подпись пакетов, review, permissions UX («читать доску / писать / сеть»), billing позже. Хранилище: npm-like registry или просто signed tarball в S3.

**Политика безопасности плагина.** Плагин по умолчанию не видит чужие документы, не получает raw Yjs, сеть — allowlist. Rate limit по аналогии с Miro credits (createImage/embed дороже).

**Оценка.** Слой 0–1: параллельно с MVP (1–2 недели на типы и README). Слой 2: 4–6 недель. Слой 3: ongoing.

### 6.8 Инфраструктура продукта

Большая часть уже в `@affine/server`. Не дублировать.

**Мультитенантность.** Оставить workspace = tenant. Не schema-per-tenant. При необходимости compliance: Postgres RLS по `workspace_id` + отдельные object-storage prefixes.

**RBAC.** Уже есть `WorkspaceRole` (external/member/admin/owner) и `DocRole`. План:

1. Продуктово прикрутить DocRole к «can edit board widgets».
2. Share link: read / comment / edit — как сейчас.
3. Блок-level: не обещать в v1. Исключения — `lockedBySelf` (уже в gfx) как soft-lock, не security.
4. Сервер: по-прежнему не интерпретирует flavour; кто в комнате документа, тот получает updates. Секретные куски — отдельный doc или E2EE (фаза later, референс CryptPad).

**Blobs.** Snapshots графиков и сцены Excalidraw — через существующий blob engine. TTL GC для устаревших snapshotBlobId.

**Наблюдаемость.** OpenTelemetry в server уже стоит рассматривать как стандарт NestJS. Добавить:

- WS: rtt, payload size, apply-time yjs на клиенте
- Widget: `echarts_init_ms`, `snapshot_age_s`, dropped frames
- Бизнес: `board_object_count`, `live_collaborators`

**Совместимость форматов.**

| Формат | Направление | Приоритет |
|---|---|---|
| PNG / SVG | export виджета и всей доски (уже частично есть) | P0 |
| `.excalidraw` | import/export sketch | P0 |
| CSV | import в database / chart | P0 |
| Mermaid | import → chart или native preview | P1 |
| draw.io XML | import shapes | P2 |
| Miro CSV / export | исследование, часто неполный | P2 |
| `.affine` snapshot | уже есть transformers | P0 |

---

## 7. Дорожная карта

Сроки наброска (MVP 2–3 мес, коллаб 1–2, масштаб 1–2, экосистема ongoing) реалистичны **если не форкать ядро и не писать Pixi в MVP**. Ниже — конкретные инкременты.

### Фаза 0 — выравнивание (1 неделя)

- [x] Каркас `@affine/whiteboard`, feature flags, виджет-заглушка на surface.
- Зафиксировать LOD-пороги и бюджеты.
- [x] Список апстрим-патчей (surface children whitelist) — `wb:*` / `wb:hello` / `wb:chart` / `wb:sketch` / `wb:board` в `SurfaceBlockSchema`.

### Фаза 1 — MVP (8–10 недель) ≈ «доска, на которой уже работают»

Параллельно две команды (виджеты / board), плюс один человек на perf-политику.

1. **Chart P0:** bar/line/pie, database dataSource, settings panel, snapshot, culling.
2. **Board P0:** `wb:board` обёртка, kanban view, peek карточки, шаблон.
3. **Sketch P0:** live только selected, SVG для остальных, import `.excalidraw`.
4. **LOD policy** для всех трёх.
5. **E2E:** 2 браузера, sync chart spec + kanban drag + reload.
6. **Экспорт:** PNG доски, SVG/PNG виджета.

Демо-сценарий приёмки: воркшоп на одной доске — фрейм «Discovery», стикеры, канбан спринта, график burndown из той же таблицы, скетч архитектуры, двое онлайн.

### Фаза 2 — Коллаборация как у Miro (4–6 недель)

- Pointer presence, follow, «посмотри сюда».
- Comment pins на gfx-блоках и карточках.
- Named versions.
- Sketch phase 2: Yjs subdoc, два художника в одном блоке.
- Kanban: чеклисты, WIP, фильтры в духе Trello.
- Chart: scatter/funnel, http source, Vega-Lite mapping как «простой режим».

### Фаза 3 — Масштаб (4–8 недель)

- Виртуализация канбана, swimlanes.
- Turbo-renderer painters для всех виджетов.
- Shared database nodes: один `affine:database` как dataSource многих chart/board на разных страницах (уже почти можно через linked doc — довести UX).
- Stress suite + телеметрия дашборд.
- RFC по Pixi L0, реализация **только если** метрики не сходятся.

### Фаза 4 — Экосистема (ongoing)

- Публичный SDK слой 1.
- Iframe plugin widgets слой 2.
- Marketplace.
- Импорт draw.io / Miro-ish.
- Board-first скин (вариант F).

---

## 8. Данные, права, наблюдаемость, тесты

### 8.1 Тестовая пирамида коллаборации

Без этого виджеты «работают у одного».

| Уровень | Что |
|---|---|
| Unit | sanitize ECharts option; mapping columns; LOD state machine; CRDT-фикстуры порядка карточек |
| Component (Lit/React) | settings panel, snapshot vs live switch |
| Playwright local | один пользователь, флаги on |
| Playwright cloud dual | два контекста, один doc: drag card, edit chart, sketch revision |
| Playwright chaos | offline 10s, concurrent edit same card title, restore version |
| Perf job | CI nightly: fps/memory на фикстуре 2k objects |

Существующие папки: `tests/` (`affine-local`, `affine-cloud`). Расширять их, не плодить новый раннер.

### 8.2 Feature flags и раскатка

Все flavour за флагами. Документы, созданные с флагом off у части клиентов, **ломают открытие** (неизвестная схема). Правило: флаг сначала включает UI создания; схема регистрируется всегда (unknown flavour не должен падать — проверить поведение store и при необходимости добавить skip-unknown в нашем слое). Это отдельный spike в фазе 0.

### 8.3 Миграции схемы блока

`metadata.version` в `defineBlockSchema`. Писать `transformer` / upgrade на v2+ сразу для chart spec. Не менять смысл полей in place.

---

## 9. Риски, метрики, команда

### 9.1 Риски

| Риск | Почему | Митигация |
|---|---|---|
| Глубокий форк surface | whitelist children, elementsCtorMap | Только gfx-блоки; один тонкий патч; contrib upstream |
| Двойной DnD / жесты | pan доски vs drag карточки vs pan скетча | Pointer capture, edit-mode lock, не тащить dnd-kit |
| Раздувание Y.Doc | ECharts option + сцены | blob/subdoc, snapshot compact (уже есть) |
| Неизвестная схема у старых клиентов | CRDT принесёт flavour | схема всегда зарегистрирована; UI спрятан флагом |
| ECharts × N инстансов | вкладка умирает | жёсткий budget + dispose |
| Excalidraw + React 19 + Lit | сложный mount | один React root на selected sketch, host через reactToLit |
| Лицензия tldraw, если когда-нибудь вариант B | watermark / commercial | не смешивать в A без юр. решения |
| Блок-level ACL ожидания заказчика | технически лгут | явно: v1 = doc ACL; secrets = отдельный doc |
| y-octo round-trip | уже отмечено в native | не менять путь клиентских снапшотов |

### 9.2 Продуктовые метрики успеха MVP

- Двое могут 30 минут вести воркшоп на одной доске без reload.
- Создание графика из таблицы < 30 секунд (picker → bar).
- 95p времени до появления remote-карточки после drop < 400ms в LAN.
- Память вкладки на демо-доске < 600 МБ.
- Ни одного `echarts.init` вне вьюпорта.

### 9.3 Команда (ориентир)

- 1 платформа (extensions, flags, perf policy, патч surface)
- 1 chart (ECharts + panel + data)
- 1 board (обёртка + data-view gaps)
- 0.5 sketch
- 0.5 QA Playwright dual-session

Итого ~4 FTE на фазу 1.

---

## 10. Чего не делать

1. Не форкать `blocksuite/affine/blocks/*` ради копипасты latex «внутрь апстрима», если можно держать пакет в `packages/frontend/whiteboard`.
2. Не вводить `BlockSpec` — API мёртв, доки BlockSuite частично врут.
3. Не заменять Atlaskit на dnd-kit в MVP.
4. Не класть функции в ECharts option.
5. Не встраивать полноэкранный Excalidraw вместо edgeless.
6. Не писать свой CRDT и не подменять nbstore/Socket.IO.
7. Не обещать block-level RBAC в маркетинге v1.
8. Не включать PixiJS «на всякий случай».
9. Не делать schema-per-tenant.
10. Не строить marketplace до того, как внутренние виджеты сами ходят через SDK.

---

## Приложение A. Карта файлов для старта

| Задача | Куда смотреть |
|---|---|
| Регистрация store extensions | `packages/frontend/core/src/blocksuite/manager/store.ts` |
| Регистрация view extensions | `packages/frontend/core/src/blocksuite/manager/view.ts` |
| Эталон блока | `blocksuite/affine/blocks/latex/src/{store,view,effects}.ts` |
| Эталон gfx-блока | `blocksuite/affine/blocks/frame`, `edgeless-text` |
| Эталон product+React | `packages/frontend/core/src/blocksuite/view-extensions/pdf` |
| Эталон AI gfx embed | `packages/frontend/core/src/blocksuite/ai/blocks/ai-chat-block` |
| Surface children | `blocksuite/affine/blocks/surface/src/surface-model.ts` |
| Kanban | `blocksuite/affine/data-view/src/view-presets/kanban/` |
| Database schema | `blocksuite/affine/model/src/blocks/database/database-model.ts` |
| Culling | `blocksuite/framework/std/src/gfx/viewport-element.ts` |
| Turbo renderer | `blocksuite/affine/gfx/turbo-renderer/` |
| Sync gateway | `packages/backend/server/src/core/sync/gateway.ts` |
| nbstore | `packages/common/nbstore/` |
| Comments | `packages/frontend/core/src/modules/comment/` |
| Excalidraw iframe | `blocksuite/affine/blocks/embed/src/embed-iframe-block/configs/providers/excalidraw.ts` |
| E2E | `tests/affine-local`, `tests/affine-cloud` |

## Приложение B. Связь с наброском

| Пункт `global_plan.md` | Решение в этом плане |
|---|---|
| ChartBlockSpec / KanbanBlockSpec / ExcalidrawBlockSpec | Store+View providers, flavour `wb:*` |
| Yjs snapshot + updates | Уже nbstore; для толстых виджетов — blob/subdoc |
| Канбан как Planka + dnd-kit | Семантика Planka, реализация data-view + Atlaskit; swimlanes фаза 3 |
| ECharts headless + форма | §6.2 |
| Viewport-culling, virtual, SVG fallback, Pixi | Culling есть; SVG/snapshot — MVP; Pixi — условная фаза 3/D |
| Plugin SDK iframe/SES | Слои 0–3 в §6.7 |
| schema-per-tenant | Отклонено, workspace isolation |
| RBAC workspace→doc→block | workspace+doc сейчас; block — не v1 |
| Playwright multi-user | Фаза 1 обязательна |
| MVP 2–3 мес | Фаза 1 (8–10 недель) при 4 FTE |

---

*Источники сверки: код AFFiNE-canary (BlockSuite ext-loader, gfx, nbstore, server sync), публичные доки Miro Web SDK и Help Center (LOD виджетов, лимит ~10k), Excalidraw collab (LWW versionNonce) и y-excalidraw, Yjs protocol/awareness, Planka/WeKan модели, ECharts handbook (canvas vs svg, large/progressive), tldraw sync (не CRDT), Liveblocks AGPL dev server.*
