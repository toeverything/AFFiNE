import { createUniComponentFromWebComponent } from '../../core/index.js';
import { uniMap } from '../../core/utils/uni-component/operation.js';
import type {
  DataViewWidget,
  DataViewWidgetProps,
} from '../../core/widget/types.js';
import { DataViewHeaderToolsFilter } from './presets/filter/filter.js';
import { DataViewHeaderToolsGanttZoom } from './presets/gantt-zoom/gantt-zoom.js';
import { DataViewHeaderToolsSearch } from './presets/search/search.js';
import { DataViewHeaderToolsSort } from './presets/sort/sort.js';
import { DataViewHeaderToolsAddRow } from './presets/table-add-row/add-row.js';
import { DataViewHeaderToolsViewOptions } from './presets/view-options/view-options.js';
import { DataViewHeaderTools } from './tools-view.js';

export const toolsWidgetPresets = {
  sort: createUniComponentFromWebComponent(DataViewHeaderToolsSort),
  filter: createUniComponentFromWebComponent(DataViewHeaderToolsFilter),
  search: createUniComponentFromWebComponent(DataViewHeaderToolsSearch),
  viewOptions: createUniComponentFromWebComponent(
    DataViewHeaderToolsViewOptions
  ),
  tableAddRow: createUniComponentFromWebComponent(DataViewHeaderToolsAddRow),
  ganttZoom: createUniComponentFromWebComponent(DataViewHeaderToolsGanttZoom),
};
export const createWidgetTools = (
  toolsMap: Record<string, DataViewWidget[]>
) => {
  return uniMap(
    createUniComponentFromWebComponent(DataViewHeaderTools),
    (props: DataViewWidgetProps) => ({
      ...props,
      toolsMap,
    })
  );
};
