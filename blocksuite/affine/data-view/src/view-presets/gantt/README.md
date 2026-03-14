# Gantt Chart View

A timeline-based database view for AFFiNE that displays rows as horizontal bars on a date axis. Each bar spans from a start date to an end date, with bar colors derived from the first select/multi-select property.

## How to Use

### Creating a Gantt View

**From the slash menu:**
Type `/gantt` in any page. This creates a new database block pre-configured with:

- A Title column
- A Status column (select type) with three options: Not Started, In Progress, Done
- Start Date and End Date columns
- One sample row with dates pre-filled (today through today + 7 days)

**From an existing database:**
Open the view switcher dropdown in the database toolbar and select "Gantt View". If the database has fewer than two date columns, the missing ones are created automatically.

### Reading the Chart

- **Left panel** — Lists task names with a colored dot matching the bar color.
- **Timeline header** — Shows months in the top row and individual dates (or weeks/months depending on scale) below.
- **Task bars** — Colored horizontal bars positioned according to start/end dates. Duration in days is shown in parentheses next to the task name.
- **Today line** — A vertical red line marking the current date.
- **Weekend columns** — Slightly dimmed grid columns on Saturdays and Sundays (day scale only).

### Interacting with Bars

- **Click** a bar or row name to open the detail panel for that row.
- **Drag** the body of a bar left/right to move both start and end dates together.
- **Drag the left edge** to change the start date.
- **Drag the right edge** to change the end date.
- Dragging snaps to whole-day increments.

### View Settings

Open the view options menu (the `...` button in the database toolbar) to configure:

| Setting        | Description                                                     |
| -------------- | --------------------------------------------------------------- |
| **Start Date** | Which date column maps to the bar's left edge                   |
| **End Date**   | Which date column maps to the bar's right edge                  |
| **Time Scale** | Zoom level: Day (40px/day), Week (16px/day), or Month (6px/day) |
| **Properties** | Show/hide columns in the detail panel                           |
| **Filter**     | Filter which rows appear in the chart                           |
| **Sort**       | Sort row order                                                  |

### Bar Colors

Bar colors are determined by the first select or multi-select property found in the database. Each option's color (as configured in the column settings) maps to the bar and the row list dot. Rows without a selected option use the default primary color.

This matches the Kanban view behavior — the same status column drives colors in both views.

## Architecture

### File Structure

```text
gantt/
  define.ts            — View type registration, data schema, default data factory
  gantt-view-manager.ts — GanttSingleView (extends SingleViewBase), column config methods
  renderer.ts          — View meta (icon, logic binding)
  selection.ts         — Selection state type
  index.ts             — Public exports
  pc/
    gantt-view-ui-logic.ts — Main UI class: layout, bar rendering, grid, today line
    task-bar.ts            — Individual bar component (positioning, drag, click)
    timeline-header.ts     — Date axis header (day/week/month scales)
    row-list.ts            — Left panel task name list
    gantt-drag-controller.ts — Pointer event handling for move/resize operations
    effect.ts              — Custom element registration
```

### Data Model

Gantt-specific view data stored alongside standard view data (filter, sort, columns):

```typescript
{
  startDateColumnId: string; // Which date column is the start
  endDateColumnId: string; // Which date column is the end
  timeScale: 'day' | 'week' | 'month';
}
```

Date values are stored as Unix timestamps (milliseconds) in the date cells themselves. The view reads them via `cellGetOrCreate(rowId, columnId).value$`.

### Rendering Pipeline

1. `GanttViewUILogic` (extends `DataViewUILogicBase`) is the controller. It holds computed signals for `dayWidth$` and `timeScale$`.
2. `GanttViewUI` (extends `DataViewUIBase`) is the LitElement. Its `render()` method reads signals directly so `SignalWatcher` tracks dependencies for automatic re-renders.
3. Timeline range is computed from the min/max dates across all rows, plus 7-day padding on each side (minimum 30 days).
4. Grid lines are rendered once as a background layer (not per row). Each row renders a `<affine-data-view-gantt-task-bar>` element positioned via `left` and `width` on the host element.
5. Scroll is synced bidirectionally between the row list and chart body.
