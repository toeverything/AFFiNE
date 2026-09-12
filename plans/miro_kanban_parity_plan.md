# План паритета Miro Kanban → Mosaic

Дата: 2026-09-12  
Связанные документы: `plans/miro_whiteboard_implementation_plan.md` (§6.3), `plans/enterprise_readiness_plan.md`, `plans/global_plan.md`  
Цель: перенести **весь пользовательский функционал** современного Miro Kanban (Format + шаблоны + связанные Table/Timeline views) в Mosaic, не копируя внутреннюю реализацию Miro и не ломая уже сделанный `wb:board`.

---

## 0. Короткий вывод

Miro больше не продаёт «колонки со стикерами». С 2025–2026 Kanban — это **layout над общей таблицей записей** (Formats & Flows). Одна и та же сущность Record живёт в Kanban / Table / Timeline / (beta) Tree. Карточка на канвасе, Jira-issue и строка таблицы — проекции одной записи.

У Mosaic уже есть правильный фундамент: `wb:board` — gfx-обёртка, данные — `affine:database` в скрытом note-hub, view — `@blocksuite/data-view` (`kanban` + `table` + `calendar`). Swimlanes, WIP, чеклисты, LOD, peek карточки — сделаны.

Разрыв не в «нарисовать колонки», а в продуктовой оболочке Miro:

1. **Единый Format** с переключением layout (Kanban ↔ Table ↔ Timeline).
2. **Шапка виджета** как у Miro: Fields / Filter / Sort / Group / Hide columns / Focus / AI.
3. **Двусторонний DnD с канвасом**: стикер/карточка → запись, запись → synced card.
4. **Галерея шаблонов** (десятки workflow, не 3 seed-схемы).
5. **AI Sidekick**: сгенерировать доску из промпта и выделенного контента канваса.
6. **Интеграции** Jira / Azure DevOps / Asana (two-way sync) — отдельный эпик, без него «полный Miro» не закрывается.
7. **Synced views** (копировать виджет как живую проекцию тех же записей, а не как клон).

Старый виджет Miro «Columns (formerly Kanban)» **не копируем**: это deprecated-рамка. Целимся в новый Kanban Format.

---

## 1. Как устроен Miro Kanban (реверс продукта)

Источники: [Kanban Help](https://help.miro.com/hc/en-us/articles/29188841316114-Kanban), [Tables](https://help.miro.com/hc/en-us/articles/22760922335506-Tables), [Timeline](https://help.miro.com/hc/en-us/articles/20185235301650-Timeline), [Planner for Jira](https://help.miro.com/hc/en-us/articles/10648975837970-Planner-for-Jira), [Templates](https://miro.com/templates/kanban/), product pages 2026.

### 1.1 Модель данных

```
Board (Miro canvas)
  └── Format widget (Kanban | Table | Timeline | Tree)
        └── Record store (одна таблица)
              ├── Fields (schema)
              ├── Records (rows)
              └── View state (layout, filter, sort, group, hidden fields)
```

Ключевые инварианты:

- Несколько виджетов на одной доске могут смотреть на **разные** store.
- Копипаст виджета даёт выбор: **synced view** тех же записей **или** независимый клон-шаблон.
- View state (filter/sort/group/layout) принадлежит виджету, записи — store.
- Synced card на канвасе — проекция record: правки идут в обе стороны. Удаление записи не удаляет карточку (становится пустой). Удаление карточки не удаляет запись.

### 1.2 Инвентарь фич Kanban Format

| Кластер               | Что есть у Miro                                                                                                    | Примечание                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Размещение            | Виджет anywhere on canvas, resize, несколько на доске                                                              | Creation bar → Formats and Flows → Kanban                             |
| Создание              | Вручную **или** Sidekick AI (промпт + mention объектов канваса)                                                    | «Create with AI» доступен и после ручного создания                    |
| Карточки              | Add / edit / delete / duplicate / DnD между колонками                                                              | Enter = новая, Tab = следующая, стрелки, Ctrl+C/V                     |
| Колонки               | Add / rename / delete / hide / reorder / color                                                                     | Hide ≠ delete: колонка жива, просто не показана                       |
| Swimlanes             | Group by второму полю; hide / rename / reorder групп                                                               | DnD карточки меняет **оба** поля                                      |
| Поля                  | Custom fields, show/hide на лице карточки, reorder                                                                 | Default: Title, Description, Estimation, Start, End, Assignee, Status |
| Организация           | Filter, Sort, Group                                                                                                | Счётчики активных filter/sort на иконках                              |
| Layout switch         | Kanban ↔ Table ↔ Timeline                                                                                          | Те же records, сохраняются filter/sort/group                          |
| Focus mode            | Fullscreen виджета, шапка с Filter/Sort/Group/Fields                                                               | «Ideate on canvas» возвращает на доску                                |
| Canvas ingest         | DnD Sticky notes, Miro Cards, Jira Cards **в** виджет                                                              | Sticky → Title; Card → маппинг полей                                  |
| Canvas egress         | DnD record **из** виджета → synced card                                                                            | Иконка БД на карточке                                                 |
| People / Story points | Виджеты, которые дропаются на Assignee / Estimation                                                                | Отдельные canvas-объекты                                              |
| Jira (beta)           | Two-way: Title, Description, Estimation, Start, End, Assignee, Status                                              | Остальные поля остаются только в Miro                                 |
| Planner for Jira      | Колонки/swimlanes = Jira fields (Status, Sprint, Priority, Components, Fix versions, custom dropdowns)             | Business/Enterprise; story point totals по колонкам                   |
| Synced views          | Copy/paste across boards                                                                                           | View кастомизируется независимо                                       |
| Collab                | Realtime, comments, notifications due/assign                                                                       | Guest editors не могут создавать Format                               |
| Perf                  | Zoom-out = simplified preview                                                                                      | Как наш LOD L0/L1                                                     |
| Timeline extras       | Scale day/week/month/quarter/year, milestones, Autofit, dependencies (Blocked by / Blocking), nesting parent/child | Nesting — Enterprise Accelerate, не рисуется в Kanban                 |
| Table extras          | Nested rows, Tree view (beta 2026), bulk edit, CSV import, conditional formatting                                  | Tree не визуализируется в Kanban                                      |
| AI                    | Генерация колонок/карточек из описания и выделенного контента                                                      | Feb 2026: AI structured Kanban/Timeline                               |

### 1.3 Старый Columns widget (не цель)

«Columns (formerly Kanban)» — рамка с колонками/swimlanes и карточками без общей таблицы. Miro сам шлёт пользователей в новый Format. В Mosaic **не** делаем второй виджет «как старые Columns». Swimlanes у нас уже через `groupByAxes`, это ближе к новому Format.

### 1.4 Каталог шаблонов Miro (то, что пользователи реально ставят)

Официальные (Miro):

| Шаблон                           | Суть                    | Колонки / оси                         | Поля                                 |
| -------------------------------- | ----------------------- | ------------------------------------- | ------------------------------------ |
| **Kanban Framework**             | Классический lean-поток | To do → In progress → Done            | Title, Assignee, Due                 |
| **Kanban Framework AI**          | То же + AI-заполнение   | То же                                 | То же                                |
| **Project Tracking**             | Мультистейдж поставки   | Backlog → In progress → Review → Done | Assignee, Due, Labels, Cover         |
| **Action Plan (SMART)**          | Стратегия → задачи      | Not started → In progress → Done      | Owner, Due, Success metric, Priority |
| **Sprint Planning with Jira**    | Планирование спринта    | Backlog / Sprint / Status             | Jira-synced + story points           |
| **Backlog Refinement with Jira** | Груминг                 | Priority / Ready / Needs info         | Jira + Acceptance                    |
| **Daily Standup with Jira**      | Standup                 | Yesterday / Today / Blocked / Done    | Assignee, Blockers                   |
| **Funding Tracker**              | Фандрайзинг             | Pipeline stages                       | Amount, Source, Owner                |
| **Meeting Minutes**              | Действия с митинга      | Action / Owner / Due                  | Status                               |

Популярные community / use-case (Miroverse + marketing pages):

| Шаблон                        | Колонки (типично)                                    | Swimlanes            | Зачем                         |
| ----------------------------- | ---------------------------------------------------- | -------------------- | ----------------------------- |
| Agile Marketing Kanban        | Idea → Brief → Production → Review → Published       | Channel / Persona    | Контент и кампании            |
| Agile Sales Kanban            | Lead → Qualified → Proposal → Negotiation → Won/Lost | Rep / Segment        | Воронка                       |
| Content calendar              | Status × Week/Month                                  | Format / Persona     | Календарный канбан            |
| Bug tracking                  | New → Triaged → In fix → QA → Closed                 | Severity / Component | Инженерия                     |
| Hiring pipeline               | Applied → Screen → Interview → Offer → Hired         | Role                 | HR                            |
| Product backlog               | Icebox → Ready → Sprint → Done                       | Epic / Theme         | Product                       |
| Release / Roadmap             | Now → Next → Later **или** Timeline                  | Team / Product       | Portfolio                     |
| Eisenhower                    | Urgent-Important матрица как 4 колонки или 2×2       | —                    | Приоритизация                 |
| 121 Kanban                    | Personal WIP-limited                                 | —                    | 1:1 / personal                |
| Weekly Kanban + Retro         | Mon–Fri + Retro                                      | Person               | Ритуал                        |
| Portfolio / Executive         | Epics, не задачи                                     | Strategic theme      | C-level                       |
| Kanban Pizza / STATIK / games | Обучение Kanban                                      | —                    | Фасилитация, низкий приоритет |

Miro группирует выбор шаблона так:

1. **Basic** — 3 колонки, индивид / маленькая команда.
2. **Multi-stage** — очереди и review (Dev, маркетинг).
3. **Swimlane** — проекты / priority / отделы по Y.
4. **Portfolio** — эпики, не таски.

Это должно стать осью нашей галереи, а не плоский список из трёх seed'ов.

---

## 2. Что уже есть в Mosaic (as-is)

Код: `packages/frontend/whiteboard/src/blocks/board/`, `blocksuite/affine/data-view/src/view-presets/kanban/`.

### 2.1 Архитектура

```
wb:board (gfx, xywh, title, linkedDocId, blockId, template)
    └── affine:database (скрытый affine:note, DocOnly, флаг wb-board-data-hub)
            ├── properties (колонки)
            ├── rows (карточки = блоки)
            └── views[]  — сейчас создаём только kanban
```

- Live L2 без swimlanes: `createBoardKanbanLogic` → `DataViewRootUILogic` (Atlaskit DnD).
- Live L2 со swimlanes: кастомная сетка `readBoardGrid` + HTML5 DnD (`applyCardMove` меняет X и Y).
- L0/L1: цветные столбцы, счётчики, первые N карточек, `LiveKanbanBudget` (default 2).
- Feature flag `enable_board_widget` — **off** по умолчанию.

### 2.2 Уже закрыто относительно Miro

| Miro                              | Mosaic                                                      |
| --------------------------------- | ----------------------------------------------------------- |
| Виджет на канвасе                 | `wb:board`                                                  |
| Несколько виджетов / разные store | `linkedDocId` + `blockId`                                   |
| Карточки CRUD + DnD               | data-view kanban + peek                                     |
| Колонки как статусы               | `select` options                                            |
| Swimlanes                         | `groupByAxes.y` (select/member)                             |
| WIP limit                         | `wipLimits` + подсветка                                     |
| Custom fields                     | database properties                                         |
| Cover / files / time spent        | image, attachment, number + «+15м»                          |
| Checklist                         | `affine:list` todo + cell fallback                          |
| Comments                          | `CommentProvider` на row blockId                            |
| Filter дорожки                    | `laneFilter`                                                |
| Group by column                   | kanban header «Group»                                       |
| Sort/filter модели                | есть в `KanbanViewData`, UI шапки виджета почти нет         |
| Board from nearby table           | slash «from table»                                          |
| LOD zoom-out                      | L0/L1/L2                                                    |
| 3 шаблона                         | `todo`, `project`, `swimlane`                               |
| Старый edgeless snapshot          | `Project Tracking Kanban.svg` в галерее — **не** `wb:board` |

### 2.3 Типы полей, которые можно использовать сразу

Из `data-view` property-presets + AFFiNE:

`title`, `text`, `select`, `multi-select`, `date`, `number`, `progress`, `checkbox`, `image`, `attachment`, `member`, `created-by`.

Не хватает как first-class: `relation` (Blocked by / Parent), `estimation` (story points как тип, не просто number), `rich-text description`, `url`, `created-time`/`updated-time` как колонки виджета.

### 2.4 Views, которые уже есть, но не подключены к board

| View             | Где                          | Готовность к Format switch                                              |
| ---------------- | ---------------------------- | ----------------------------------------------------------------------- |
| `kanban`         | data-view                    | Да, основной                                                            |
| `table`          | data-view, в т.ч. pc-virtual | Да, 1–2 недели обвязки                                                  |
| `calendar`       | data-view                    | Частичный суррогат Timeline (нет bars, scale, milestones, dependencies) |
| Timeline / Gantt | нет                          | Нужен новый view-preset                                                 |
| Tree             | нет                          | Позже, как table grouping + parent relation                             |

---

## 3. Матрица разрывов (Miro → Mosaic)

Легенда приоритета: **P0** = без этого Kanban не ощущается как Miro, **P1** = ежедневный workflow, **P2** = enterprise/integrations, **P3** = nice-to-have / facilitation games.

| #   | Фича Miro                                                                 | Сейчас                                            | Приоритет | Сложность | Куда класть                                  |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------- | --------- | --------- | -------------------------------------------- |
| F1  | Шапка Format: layout / fields / filter / sort / group / hide / focus / AI | Только title + settings swimlane/WIP              | P0        | M         | `board-block.ts` + toolbar                   |
| F2  | Переключение Kanban ↔ Table на том же store                               | Только kanban                                     | P0        | S         | `viewManager` + lod                          |
| F3  | Hide column (не удаляя option)                                            | Нет                                               | P0        | S         | `groupProperties` / view meta                |
| F4  | Column UX: rename, color, reorder, add, delete, ⋮ меню                    | Через database UI, не на виджете                  | P0        | M         | data-view group header                       |
| F5  | Card face: show/hide/reorder fields                                       | `KanbanViewColumn.hide` есть, UI спрятан          | P0        | S         | Fields menu                                  |
| F6  | Default Miro fields на каждом шаблоне                                     | Частично (project)                                | P0        | S         | `types.ts` + hub seed                        |
| F7  | Focus / fullscreen mode                                                   | Нет                                               | P0        | M         | overlay + lock pan                           |
| F8  | DnD sticky/shape/note → новая запись                                      | Нет                                               | P0        | L         | gfx drop target                              |
| F9  | DnD record → synced card на канвасе                                       | Нет                                               | P0        | L         | новый `wb:card` или reuse database peek card |
| F10 | Copy/paste: synced view vs clone                                          | Всегда новый linked? фактически clone schema+data | P0        | M         | clipboard config                             |
| F11 | Галерея шаблонов + Creation bar                                           | 3 slash items                                     | P0        | M         | templates + slash + insert panel             |
| F12 | Timeline layout                                                           | Нет                                               | P1        | L         | новый view-preset                            |
| F13 | Swimlane hide/reorder/rename как у Group menu                             | Ось Y есть, меню групп бедное                     | P1        | M         | groupProperties                              |
| F14 | Keyboard parity (Enter/Tab/стрелки в focus)                               | Частично в data-view                              | P1        | S         | hotkeys                                      |
| F15 | Bulk select/move/delete                                                   | Table умеет, kanban — слабо                       | P1        | M         | selection                                    |
| F16 | CSV import/export records                                                 | Нет на виджете                                    | P1        | M         | database adapter                             |
| F17 | AI generate from prompt + selection                                       | `enable_ai` есть, генерации board нет             | P1        | L         | AI skill + hub                               |
| F18 | Notifications due/assign                                                  | Нет на board                                      | P1        | M         | existing notif pipeline                      |
| F19 | Card color + conditional formatting                                       | Цвет колонки/тега есть                            | P1        | M         | select color + rules                         |
| F20 | Relation: Blocked by / Blocking + линии на Timeline                       | Нет типа relation                                 | P2        | L         | новый property                               |
| F21 | Parent/child nesting                                                      | Нет                                               | P2        | L         | relation + table tree                        |
| F22 | Jira two-way sync                                                         | Нет (integrations = Readwise/Calendar)            | P2        | XL        | новый integration                            |
| F23 | Planner for Jira / Azure                                                  | Нет                                               | P2        | XL        | поверх F22                                   |
| F24 | Asana / Azure / Trello ingest                                             | Нет                                               | P2        | XL        | connectors                                   |
| F25 | People & Story point canvas widgets                                       | Нет                                               | P2        | M         | маленькие gfx-виджеты                        |
| F26 | Milestones на Timeline                                                    | Нет                                               | P2        | M         | timeline overlay                             |
| F27 | Guest cannot create Format                                                | Права board widgets есть грубо                    | P2        | S         | DocRole                                      |
| F28 | Search индексирует текст карточек                                         | Нет (см. enterprise plan)                         | P2        | M         | indexer                                      |
| F29 | Custom Blueprints (space-level)                                           | Workspace templates документов есть               | P3        | L         | template-doc                                 |
| P30 | Facilitation games (Pizza, STATIK)                                        | Нет                                               | P3        | S         | статичные edgeless snapshots                 |
| F31 | Smart Grid / auto-align                                                   | Нет                                               | P3        | S         | не приоритет: gfx already snaps              |
| F32 | Flag on by default                                                        | off                                               | P0        | S         | `feature-flag/constant.ts`                   |

---

## 4. Целевая архитектура (как переносим, не переписывая)

### 4.1 Принцип

Не делать «ещё один канбан на dnd-kit». Расширяем Format-виджет:

```
wb:board                          // gfx shell + LOD + focus + drop zone
  props:
    linkedDocId, blockId          // store
    layout: 'kanban' | 'table' | 'timeline' | 'calendar'
    viewId                        // конкретный data-view
    templateId                    // какой seed/gallery item
    syncMode: 'owned' | 'projection'   // clone vs synced view
    liveBudgetExempt

affine:database                   // record store (как сейчас)
  views[]:
    { mode: kanban, filter, sort, groupBy, groupByAxes, wipLimits, header, columns[].hide }
    { mode: table,  ... }
    { mode: timeline, scale, range, milestones, ... }   // NEW
```

`layout` виджета = какой view показать. Смена layout **не копирует** записи, а `viewManager.setCurrentView` / создаёт view того же datasource.

Synced view (`syncMode: 'projection'`): второй `wb:board` указывает на тот же `blockId`. Свои `viewId` (свой filter/sort/layout), общие rows/cells.

Synced card: gfx-блок `wb:record-card` с `{ databaseId, rowId }`. Рендер — те же поля, что card face. Запись в Yjs одна.

### 4.2 Слои

| Слой           | Ответственность                      | Файлы                                       |
| -------------- | ------------------------------------ | ------------------------------------------- |
| Store          | schema, rows, views                  | `hub.ts`, `affine:database`                 |
| Grid semantics | X×Y, WIP, checklist                  | `semantics.ts`, `grid.ts`                   |
| Views          | kanban / table / timeline render     | data-view presets + `kanban-host.ts`        |
| Shell          | LOD, focus, toolbar, drop, templates | `board-block.ts`, новый `board-toolbar.tsx` |
| Canvas cards   | synced projections                   | новый `blocks/record-card/`                 |
| Templates      | catalog + seed                       | `types.ts` → вынести в `templates/`         |
| AI             | prompt → schema+records              | `packages/frontend/core` AI + hub           |
| Integrations   | Jira mapping                         | новый module, не в whiteboard               |

### 4.3 Что не трогать

- Atlaskit DnD внутри одноосного kanban.
- Live budget / L0 WebGL.
- Отдельный сервер «как Planka».
- Marketplace plugin runtime (это enterprise plan).

---

## 5. Пофазный план работ

Оценки — календарные недели одной сильной команды (1–2 frontend + 1 backend на интеграциях). Фазы последовательны по зависимостям, внутри фазы — параллелизуемы.

### Фаза A — Format shell (P0, 3 недели)

Сделать виджет похожим на Miro ещё до Timeline и Jira.

**A1. Toolbar виджета** (`board-toolbar.tsx`)

Элементы слева направо, как у Miro:

1. Layout switcher (Kanban / Table).
2. Fields (добавить / скрыть / порядок / типы).
3. Filter (существующий `FilterGroup` data-view).
4. Sort.
5. Group (ось X для kanban = колонки; ось Y = swimlanes).
6. Hide columns.
7. Focus.
8. ⋮ : duplicate, copy link, export CSV, delete, convert to table.

Сейчас `headerWidget: undefined` в `kanban-host.ts` — это дыра. Либо включить стандартный database header в live-режиме, либо свой React toolbar, который пишет в `viewDataUpdate`.

**A2. Layout Kanban ↔ Table**

- При seed создавать **оба** view (`kanban` + `table`).
- `wb:board.layout` хранит текущий.
- L2 table: существующий table pc-virtual (не изобретать).
- L0/L1 table: упрощённая сетка (первые N строк).

**A3. Column & card field UX**

- ⋮ на колонке: rename, color, move, hide, delete, WIP.
- Fields menu: toggle `columns[].hide`, cover, title.
- Default field set на **всех** шаблонах: Title, Description (`text`), Status, Assignee, Start, End, Estimation (`number`), Priority (`select`).

**A4. Focus mode**

- Кнопка «диагональная стрелка».
- Overlay на весь editor viewport, pan доски locked (как edit-mode sketch).
- Esc / «Back to canvas» выходит.
- В focus всегда L2, budget exempt.

**A5. Flag**

- `enable_board_widget` default **true** после A1–A4 + smoke e2e.
- Slash + правая панель вставки «Formats».

**Критерий фазы A.** С канваса: вставить Kanban → добавить колонку и поле → скрыть колонку → filter по assignee → переключить Table и увидеть те же записи → fullscreen → вернуться. Второй клиент видит записи, не обязательно идентичный filter.

### Фаза B — Canvas ↔ records (P0, 3–4 недели)

Это то, за что команды любят Miro: брейнсторм стикерами → сразу план.

**B1. Drop ingest**

Drop target на `wb:board` (уже `pointerdown stopPropagation`):

| Источник                                             | Маппинг                             |
| ---------------------------------------------------- | ----------------------------------- |
| Edgeless text / note / paragraph                     | Title                               |
| Affine frame children (sticky-like shapes with text) | Title + color → Labels              |
| Database row / peek card                             | copy cells по имени поля            |
| `wb:record-card` с **другого** store                 | новая запись (unsynced), как у Miro |
| `wb:record-card` с **того же** store                 | no-op                               |

Нужен hit-test колонки/lane под курсором → сразу проставить Status / swimlane.

**B2. Synced record-card**

Новый gfx flavour `wb:record-card`:

```ts
props: { xywh, databaseDocId, databaseId, rowId, compact?: boolean }
```

- Face = те же visible fields, что у kanban card.
- Иконка «linked to board».
- Правка title/assignee/status на карточке пишет в database.
- Удаление записи: карточка остаётся, empty-state «record deleted».
- Удаление карточки: запись жива.
- DnD People/Estimation позже (фаза D), сейчас — inline edit.

**B3. Copy/paste виджета**

Расширить `edgeless-clipboard-config.ts`:

- Paste dialog: «Synced view» / «Duplicate data».
- Synced: новый `wb:board` + новый viewId, тот же `blockId`.
- Duplicate: `createBoardDatabase` + snapshot rows/cells.

**B4. Keyboard**

Parity в focus: Enter new card in column, Tab next card, arrows, Cmd+C/V duplicate, Cmd+↑/↓ insert above/below.

**Критерий фазы B.** Набросали 8 стикеров → дропнули в To do → открыли Table, 8 строк. Вытащили одну запись на канвас, переименовали, в канбане то же имя. Скопировали виджет как synced view, сменили filter — исходный виджет не изменился.

### Фаза C — Шаблоны (P0/P1, 2–3 недели, параллельно с B)

Сейчас `BOARD_TEMPLATES = ['todo','project','swimlane']` и `columnsForTemplate` слишком узкие. Вынести каталог.

**C1. Модель шаблона**

```ts
// packages/frontend/whiteboard/src/blocks/board/templates/schema.ts
type BoardTemplateDef = {
  id: string;
  family:
    | 'basic'
    | 'multistage'
    | 'swimlane'
    | 'portfolio'
    | 'ritual'
    | 'integration';
  titleKey: string;
  descriptionKey: string;
  preview: string; // svg/png в @affine/templates
  layout: 'kanban' | 'table' | 'timeline';
  columns: BoardColumnSeed[]; // schema
  groupBy: { x: string; y?: string }; // имена полей
  wipLimits?: Record<string, number>; // по имени статуса
  hiddenFields?: string[];
  seedRows: Array<Record<string, unknown>>;
  canvasExtras?: 'none' | 'legend' | 'standup-notes';
};
```

Регистрация: `templates/catalog.ts`. Slash и галерея читают каталог, не хардкод из трёх веток.

**C2. Обязательный набор v1 (паритет «официальных» Miro + use-case pages)**

Реализовать как seed, не как мёртвые картинки:

1. `kanban-framework` — To do / In progress / Done, WIP=3 на In progress.
2. `project-tracking` — Backlog / In progress / Review / Done + Assignee, Due, Labels, Cover, Start, End, Estimation.
3. `action-plan` — SMART: Not started / In progress / Done; поля Goal, Metric, Owner, Due, Priority.
4. `swimlane-by-assignee` — project-tracking + Y=Assignee.
5. `swimlane-by-priority` — Expedite / Standard / Intangible как Y (классы обслуживания Kanban).
6. `bug-tracker` — New / Triaged / In fix / QA / Closed; Severity, Component, Repro.
7. `content-calendar` — Idea / Writing / Review / Scheduled / Published; Channel, Persona, Publish date. Layout default = table или kanban, timeline когда появится.
8. `hiring-pipeline` — Applied / Screen / Interview / Offer / Hired; Role, Candidate, Owner.
9. `sales-pipeline` — Lead / Qualified / Proposal / Negotiation / Won / Lost; Amount (number), Owner.
10. `product-backlog` — Icebox / Ready / In sprint / Done; Effort, Value, Epic (select).
11. `now-next-later` — portfolio, крупные карты.
12. `weekly-standup` — Yesterday / Today / Blocked / Done; Y=Assignee.
13. `eisenhower` — 4 колонки (или 2×2: X=Urgent, Y=Important).
14. `release-train` — layout timeline, когда будет фаза D; до неё — kanban Now/Next/Later.

Каждый: i18n, 3–6 seed-карточек, unit-тест схемы (как `templates.spec.ts`).

**C3. Галерея в продукте**

- Slash: оставить 3 быстрых (Framework, Project, Swimlane) + пункт «More kanban templates…».
- Панель шаблонов edgeless (`@affine/templates`): категория **Kanban & flows**, превью SVG генерить из seed (не рисовать вручную 14 картинок — скриншот L1).
- Старый `Project Tracking Kanban.svg` либо заменить на живой `wb:board`, либо пометить legacy.

**C4. Пользовательские шаблоны**

- «Save board as template» → workspace template-doc со snapshot database schema+sample rows.
- Позже стыкуется с Custom Blueprints (P3).

**Критерий фазы C.** Из галереи ставится 14 досок, у каждой валидная schema, группировка, seed. Смена языка локализует названия колонок у **новых** инстансов (как сейчас `localizeColumnName`).

### Фаза D — Timeline layout (P1, 4–5 недель)

Без Timeline «переключение views как в Miro» неполное. Calendar view **не замена**: у Miro bars, scale, drag-resize дат, milestones, dependencies.

**D1. View-preset `timeline` в data-view**

Минимум:

- Rows слева (title, assignee).
- Time bars по Start/End.
- Scale: day / week / month / quarter.
- Drag концов бара → меняет dates.
- Drag бара → shift обеих дат.
- Group by поле (эпик, assignee) — вертикальные секции.
- Autofit range.
- Warning если End < Start.
- Placeholder «+» если дат нет.

LOD: L0 = ось + цветные полоски без текста; L1 = titles; L2 = interactive.

**D2. Подключение к `wb:board.layout`**

Триплет Kanban / Table / Timeline. Filter/sort/group сохраняются (где семантически осмысленно: group table ≠ swimlane, но одно поле).

**D3. Milestones**

Не records, а `view.milestones: { id, date, title, color }[]`. Флажки на оси.

**D4. Dependencies (можно сдвинуть в D+ / фазу E)**

Тип поля `relation` с ролями `blocking` / `blocked-by`. На timeline — линии между bars. На kanban — иконка блокерa, без линий (как Miro: visualization not in Kanban).

**Критерий фазы D.** Project-tracking доска → Timeline, бары на местах, растянули дату — в Table те же Start/End. Milestone «Release» виден. Zoom-out не убивает FPS (бюджет как у kanban).

### Фаза E — AI Sidekick (P1, 3 недели, нужен `enable_ai`)

Поведение Miro: Creation bar → Kanban открывает панель; промпт + @mentions объектов канваса; «Create with AI» на уже стоящем виджете.

**E1. Skill `board.generate`**

Вход:

- text prompt;
- selection snapshot (тексты стикеров, заголовки frames, markdown выделенных note);
- optional existing schema.

Выход JSON:

```ts
{ templateId?: string; columns: BoardColumnSeed[]; rows: Record<string, string>[]; groupBy: { x: string; y?: string } }
```

Строгая схема, без произвольного JS. Дальше `createBoardDatabase` / `seedColumns` / `seedCards`.

**E2. UX**

- При insert Kanban: split panel «Prompt» | «Blank / Template».
- На выделенных стикерах: «Turn into Kanban» (детерминированный путь без LLM как fallback: каждый стикер = row, колонка = To do).
- Create with AI дописывает карточки, не уничтожая существующие (append).

**E3. Guardrails**

- Лимит rows (например 50 за вызов).
- Не вызывать модель, если selection уже структурирован — сначала heuristic.
- Телеметрия: `whiteboard.board.ai_generate`.

**Критерий фазы E.** Промпт «канбан запуска лендинга, 3 колонки, 6 задач» ставит виджет. Выделили 10 стикеров → «Turn into Kanban» → 10 карточек в To do.

### Фаза F — Интеграции (P2, 8–12 недель)

Это единственный кусок, которого нет в whiteboard-слое и который нельзя честно «нарисовать». Существующий `modules/integration` — Readwise и Calendar, не issue-трекеры.

**F1. Абстракция IssueSource**

```ts
interface IssueSource {
  id: 'jira' | 'azure' | 'asana';
  search(query): IssuePreview[];
  import(ids): RecordDraft[]; // → database rows
  push(rowId, fields: SyncableFields): void;
  pull(since: timestamp): IssueDelta[];
}
```

SyncableFields как у Miro: Title, Description, Estimation, Start, End, Assignee, Status.

**F2. Jira first**

- OAuth / API token at workspace.
- Embed «Jira card» на канвасе (app-card analog) **и** drop в `wb:board`.
- Status mapping: Miro-колонка ↔ Jira transition (не всегда 1:1 — UI маппинга).
- Конфликты: last-write-wins + banner «Updates available» (как Planner).
- Поля вне allowlist живут только в Mosaic.

**F3. Planner mode** (после F2)

Отдельный layout-preset: колонки = Sprint | Status | Priority | Component | Fix version | custom single/multi select. Swimlanes = второе Jira-поле. Story point sum в шапке колонки.

**F4. Azure DevOps / Asana**

Тот же IssueSource. Azure — Enterprise-only у Miro; у нас можно тот же флаг плана.

**Критерий фазы F.** Импорт спринта → канбан; перенос карточки To do → In progress делает transition в Jira; правка summary в Jira приходит после pull. Несинхронизируемое поле «Reviewer» не падает.

### Фаза G — Полировка до «полного» паритета (P1–P3, ongoing)

| Работа                                    | Фаза-донор                              |
| ----------------------------------------- | --------------------------------------- |
| Bulk actions на kanban                    | A/B                                     |
| CSV import/export                         | A                                       |
| Notifications assignee/due                | существующий mail/push                  |
| Conditional color rules                   | select colors + simple rules engine     |
| People / Story point widgets              | маленькие gfx, drop на card/board       |
| Parent/child + Tree view                  | relation property, table first          |
| Search: индекс title/description карточек | indexer                                 |
| Mobile: read + move card, без settings    | enterprise plan уже описывает           |
| Facilitation snapshots (Pizza, STATIK)    | статичные edgeless templates, не Format |
| Custom Blueprints                         | workspace template packs                |
| Default-on flag, docs, onboarding         | после A                                 |

---

## 6. Детальный дизайн ключевых фич

### 6.1 Шапка и view state

View state хранить в `affine:database.views[i]`, не в `wb:board`, кроме `layout` и `viewId` (какой view этот виджет показывает). Иначе synced views невозможно развести.

```ts
type FormatViewState = {
  mode: 'kanban' | 'table' | 'timeline';
  filter: FilterGroup;
  sort?: Sort;
  groupBy?: GroupBy; // колонки kanban
  groupByAxes?: { x?: string; y?: string };
  wipLimits?: Record<string, number>;
  laneFilter?: string;
  hiddenGroupIds?: string[]; // hide column/swimlane
  columns: { id: string; hide?: boolean }[];
  header: { titleColumn?: string; coverColumn?: string; iconColumn?: string };
};
```

### 6.2 Hide vs delete

- Hide column: option остаётся, карточки с этим статусом доступны в Table и при unhide.
- Delete column: требуется migrate (перенос в Uncategorized или запрет, если есть cards) — как database select delete.

### 6.3 Swimlanes

Уже есть. Довести UX до Miro Group menu:

- Hide group, rename (переименовать option), reorder (`groupProperties`), add group above/below.
- DnD карточки между lanes уже меняет Y.
- Filter одной lane — есть (`laneFilter`).

Live swimlane сейчас **не** Atlaskit, а HTML5 grid. Оставить. Не смешивать pointer-stack с gfx pan (уже соблюдено).

### 6.4 Synced card vs peek

Сейчас открытие карточки — `PeekViewProvider` (документ строки). Это хорошо как **detail**. Synced card — **объект канваса** для обсуждения рядом со стикерами. Оба нужны: peek = табличная карточка AFFiNE, `wb:record-card` = Miro canvas card.

### 6.5 Права

`canEditBoardWidgets` уже есть. Добавить:

- Guest / readonly: нельзя insert Format, можно смотреть focus read-only.
- Projection view: edit records если есть `Doc_Update` на store doc; edit view state — если edit на canvas doc.

### 6.6 Производительность

Не регрессировать:

- `maxLiveKanban` (и новый `maxLiveTimelines`).
- Виртуализация колонок (>6) и карточек.
- Focus mode не снимает culling других виджетов на доске.
- Timeline L0 без DOM на каждый бар: canvas/SVG snapshot по аналогии со sketch.

### 6.7 i18n

Все seed-строки через `I18n['com.affine.whiteboard.board.*']`, как сейчас Status/Assignee. Каталог шаблонов — отдельные ключи `com.affine.whiteboard.board.template.<id>.title`.

---

## 7. Карта файлов (где работы)

| Задача            | Путь                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------- |
| Schema виджета    | `packages/frontend/whiteboard/src/blocks/board/model.ts`                                |
| Seed / hub        | `hub.ts`, вынести templates из `types.ts`                                               |
| Toolbar / focus   | новые `board-toolbar.tsx`, `board-focus.ts`                                             |
| Settings          | расширить `board-settings-panel.tsx` или заменить toolbar                               |
| Live host         | `kanban-host.ts` — headerWidget, table host                                             |
| LOD               | `lod-view.ts`, `live-budget.ts`                                                         |
| Clipboard         | `edgeless-clipboard-config.ts`                                                          |
| Slash / insert    | `slash-menu.ts` + edgeless insert panel                                                 |
| Catalog           | `packages/frontend/whiteboard/src/blocks/board/templates/`                              |
| Галерея превью    | `packages/frontend/templates/` категория Kanban                                         |
| Synced card       | `packages/frontend/whiteboard/src/blocks/record-card/`                                  |
| Timeline view     | `blocksuite/affine/data-view/src/view-presets/timeline/`                                |
| Relation property | `blocksuite/affine/data-view` + `packages/frontend/core/.../database-block/properties/` |
| AI                | `packages/frontend/core/src/blocksuite/ai/` + hub generate                              |
| Jira              | `packages/frontend/core/src/modules/integration/` + backend connector                   |
| Flag              | `packages/frontend/core/src/modules/feature-flag/constant.ts`                           |
| Тесты             | `templates.spec.ts`, `grid.spec.ts`, новые e2e `tests/`                                 |
| Docs              | этот файл + `docs/readme.md` (флаг)                                                     |

---

## 8. Тест-план

### Unit

- Каждый template: колонки, options, groupBy, wip, seed row count.
- Hide column не теряет cards.
- `applyCardMove` X+Y.
- Clipboard: projection сохраняет blockId, clone — новый databaseId.
- Ingest: sticky text → title.
- Timeline: resize bar patches start/end; invalid range flagged.
- AI JSON schema validation (без сети).

### E2E Playwright (2 браузера)

1. Create framework board, drag card, second user sees order.
2. Switch to table, edit cell, back to kanban.
3. Focus in/out, pan не двигает доску в focus.
4. Drop 3 stickies into column.
5. Pull record to canvas, edit, roundtrip.
6. Paste synced view, change filter, source unchanged.
7. Reload: snapshot L1, zoom in L2.
8. (F) Jira: mock server, status transition.

### Perf

- 200 cards / 8 columns: L0 < 16ms frame на zoom-out (контракт как у chart/sketch).
- Не больше 2 live kanban + 1 live timeline.

---

## 9. Порядок внедрения и оценки

| Фаза                       | Что получает пользователь                                             | Недели | Зависимости       |
| -------------------------- | --------------------------------------------------------------------- | ------ | ----------------- |
| **A** Format shell         | «Это Miro kanban»: шапка, table switch, fields, focus, default fields | 3      | —                 |
| **B** Canvas ingest/egress | Стикеры → задачи, synced cards, synced views                          | 3–4    | A                 |
| **C** Template gallery     | 14 workflow, галерея                                                  | 2–3    | A (параллельно B) |
| **D** Timeline             | Roadmap layout                                                        | 4–5    | A                 |
| **E** AI                   | Sidekick generate / stickies→board                                    | 3      | A, C              |
| **F** Jira+                | Two-way + Planner                                                     | 8–12   | B, backend        |
| **G** Polish               | bulk, CSV, notif, relations viz, mobile                               | 4+     | D/F               |

**Честный MVP «как Miro для команд без Jira»:** A+B+C ≈ **8–10 недель**.  
**Паритет Format (включая Timeline и AI):** +D+E ≈ **15–18 недель**.  
**Паритет с интеграциями:** +F ≈ **6 месяцев** от старта A.

Включать флаг по умолчанию — после A и базового e2e, не дожидаясь Jira.

---

## 10. Что сознательно не копируем 1:1

| Miro                                   | Почему иначе                                             |
| -------------------------------------- | -------------------------------------------------------- |
| Sidekick как отдельный продукт         | У нас AFFiNE AI panel; тот же skill, другой chrome       |
| App-card iframe marketplace            | Нет plugin sandbox (enterprise plan)                     |
| Smart Grid                             | Наш gfx already has snap; отдельный grid-engine не нужен |
| Guest-editor нюансы биллинга           | Наши роли DocRole/Workspace, не Miro seats               |
| Старый Columns widget                  | Deprecated                                               |
| Pizza Game / Mythbusters               | Статичные facilitation boards, не Format engine          |
| Nested rows visualization **в** Kanban | У самого Miro её нет; только Table/Timeline              |
| dnd-kit                                | Запрещено планом whiteboard: третий pointer-stack        |

---

## 11. Definition of Done «весь функционал Miro Kanban»

Продукт можно считать закрытым относительно Kanban Format, когда выполнены **все** пункты:

1. На канвасе создаётся Format из creation/slash/gallery/AI.
2. Одна запись редактируется в Kanban, Table и Timeline без копирования.
3. Колонки и swimlanes: CRUD, hide, reorder, color, WIP.
4. Поля: CRUD, show/hide на карточке, default set Miro.
5. Filter / Sort / Group с индикаторами.
6. Focus mode.
7. Стикеры и карточки дропаются в виджет; записи вытаскиваются как synced cards.
8. Copy: synced view и независимый клон.
9. Несколько виджетов / разные store на одной доске.
10. Галерея покрывает 4 семейства: basic, multi-stage, swimlane, portfolio (+ ритуалы standup/backlog).
11. AI генерирует схему и карточки из промпта и selection.
12. LOD и live-budget держат большую доску.
13. Jira two-way по allowlist полей (для полного маркетингового паритета).
14. Флаг включён, i18n, e2e двух клиентов, документация в `docs/`.

Пункты 1–12 — **продуктовый паритет без экосистемы**. 13 — **экосистемный паритет**. 14 — выпуск.

---

## 12. Рекомендуемый первый спринт (неделя 1)

Не начинать с Timeline и не начинать с Jira.

1. Вынести `BoardTemplateDef` и перевести текущие `todo/project/swimlane` на каталог.
2. Добавить default fields (Description, Start, End, Estimation, Priority) в `project` и `kanban-framework`.
3. Toolbar: Fields hide + Filter + layout switch Kanban/Table.
4. Создавать table view вместе с kanban в `createBoardDatabase`.
5. Unit-тесты каталога и hide-field.
6. Черновик UI Focus (можно заглушка overlay).

После этого доска уже продаётся как «Kanban Format», а не как «database, положенная на холст».

---

## 13. Ссылки на код as-is

- Виджет: `packages/frontend/whiteboard/src/blocks/board/`
- Шаблоны seed: `types.ts`, `hub.ts`, `slash-menu.ts`
- Сетка swimlanes: `grid.ts`, `semantics.ts`, `lod-view.ts`
- Data-view kanban: `blocksuite/affine/data-view/src/view-presets/kanban/`
- Views: `view-presets/index.ts` (table, kanban, calendar — **нет timeline**)
- Предыдущий план канбана: `plans/miro_whiteboard_implementation_plan.md` §6.3 (выполнен как Planka-семантика, не как Miro Format)
  )
