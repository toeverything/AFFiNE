import { GanttViewUI } from './gantt-view-ui-logic.js';
import { GanttRowList } from './row-list.js';
import { GanttTaskBar } from './task-bar.js';
import { GanttTimelineHeader } from './timeline-header.js';

export function pcEffects() {
  customElements.define(
    'affine-data-view-gantt-timeline-header',
    GanttTimelineHeader
  );
  customElements.define('affine-data-view-gantt-task-bar', GanttTaskBar);
  customElements.define('affine-data-view-gantt-row-list', GanttRowList);
  customElements.define('dv-gantt-view-ui', GanttViewUI);
}
