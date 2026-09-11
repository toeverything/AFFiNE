# `@affine/whiteboard`

Каркас gfx-виджетов доски. Новый виджет регистрируется так же, как latex, но с `GfxCompatible` и родителем `affine:surface`.

## Как добавить виджет за один день

1. Создайте схему в `src/blocks/<name>/model.ts`:
   - flavour вида `wb:<name>` (не `affine:*`, чтобы не пересечься с апстримом);
   - gfx-пропы: `xywh`, `index`, `rotate`, `scale`, `lockedBySelf`;
   - `parent: ['affine:surface', 'affine:note']`.
2. Lit-view: page (`wb-<name>`), edgeless (`toGfxBlockComponent`) и preview (только snapshot, без live-библиотек).
3. Зарегистрируйте виджет через `registerGfxWidget`:

```ts
export const chartWidget = registerGfxWidget({
  flavour: 'wb:chart',
  schema: ChartBlockSchemaExtension,
  view: {
    page: 'wb-chart',
    edgeless: 'wb-chart-edgeless',
    preview: 'wb-chart-preview',
  },
  slash: ChartSlashMenuConfigExtension,
  clipboard: EdgelessClipboardChartConfig,
  interaction: ChartBlockInteraction,
  snapshotPainter: props => props.snapshotBlobId as string | undefined,
});
```

4. Добавьте виджет в массивы `WhiteboardStoreExtension` и `WhiteboardViewExtension`.
5. Surface уже принимает `wb:*` (`SurfaceBlockSchema.metadata.children`). Новые flavour в этот список добавлять не нужно.
6. Feature flag: `enable_whiteboard_*` в `AFFINE_FLAGS` + `BlockSuiteFlags`, затем прокиньте его в `getViewManager().config.whiteboard(...)`.
7. Slash-menu: `insertGfxWidget(std, flavour)` — на доске ставит блок в центр вьюпорта, в page-mode — после текущей строки.

Эталон — `src/blocks/hello` (`wb:hello`). График — `src/blocks/chart` (`wb:chart`): ECharts, источники `database` / `inline` / `csv-blob` / `http`, правая React-панель, snapshot и бюджет `maxLiveCharts = 3`.

Флаг `enable_whiteboard_chart` по умолчанию выключен. Preview-scope рисует только `snapshotBlobId`, без ECharts.

Производительность канваса (§6.5) — `src/perf`: `WhiteboardPerfPolicy` (LOD + приоритет selected > hover > центр вьюпорта), общий `SnapshotCache` (LRU по памяти), snapshot-painter для `ViewportTurboRendererExtension`, телеметрия `frame_time` / `live_widget_count` / `cull_ratio` / `ws_rtt` и stress-план 1k notes + 50 chart snapshots + 5 live charts + 1 sketch. HUD — флаг `enable_whiteboard_perf_hud`. L0 presentation layer (фаза D) — флаг `enable_whiteboard_l0_layer` (по умолчанию выключен): при zoom < `WHITEBOARD_LOD.z0` DOM/ECharts скрываются, AABB рисует тонкий WebGL-батч (Canvas2D fallback). Полный PixiJS в зависимости не добавляется.

Набросок — `src/blocks/sketch` (`wb:sketch`): сцена в Yjs-subdoc (`subdocGuid`, `Y.Array` элементов в стиле y-excalidraw) + SVG-снимок для L0/L1. Два человека рисуют в одном блоке; курсоры внутри рамки через awareness. Live `@excalidraw/excalidraw` (или fallback-холст) только в L2; двойной клик входит в edit и блокирует pan доски. Импорт/экспорт `.excalidraw`, PNG, SVG. Свой `Y.UndoManager` на subdoc. Бюджет `maxLiveSketches = 1`. Флаг `enable_whiteboard_sketch` по умолчанию выключен.

Канбан — `src/blocks/board` (`wb:board`): тонкая gfx-обёртка над `affine:database`. Данные живут в DocOnly note-hub того же документа. LOD: L0 — цветные колонки и счётчики, L1 — первые N карточек + «+N», L2 — полный kanban data-view (Atlaskit, peek-view) или сетка дорожек (колонка × исполнитель) без dnd-kit. WIP, чеклисты, вложения и затраченное время — в cells/view meta. Живых досок не больше `maxLiveKanban = 2`. Флаг `enable_board_widget` по умолчанию выключен.
