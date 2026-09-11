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

Канбан — `src/blocks/board` (`wb:board`): тонкая gfx-обёртка над `affine:database`. Данные живут в DocOnly note-hub того же документа; на доске рендерится существующий kanban data-view (Atlaskit), карточка открывается через peek-view. Флаг `enable_board_widget` по умолчанию выключен.
