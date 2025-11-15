import { FilterConditionView } from './quick-setting-bar/filter/condition-view.js';
import { FilterGroupView } from './quick-setting-bar/filter/group-panel-view.js';
import { FilterBar } from './quick-setting-bar/filter/list-view.js';
import { FilterRootView } from './quick-setting-bar/filter/root-panel-view.js';
import { SortRootView } from './quick-setting-bar/sort/root-panel.js';
import { DataViewHeaderToolsFilter } from './tools/presets/filter/filter.js';
import { DataViewHeaderToolsSearch } from './tools/presets/search/search.js';
import { DataViewHeaderToolsSort } from './tools/presets/sort/sort.js';
import { DataViewHeaderToolsAddRow } from './tools/presets/table-add-row/add-row.js';
import { NewRecordPreview } from './tools/presets/table-add-row/new-record-preview.js';
import { DataViewHeaderToolsViewOptions } from './tools/presets/view-options/view-options.js';
import { DataViewHeaderTools } from './tools/tools-view.js';
import { DataViewHeaderViews } from './views-bar/views-view.js';

export function widgetPresetsEffects() {
  customElements.define('data-view-header-tools', DataViewHeaderTools);
  customElements.define('filter-bar', FilterBar);
  customElements.define('filter-condition-view', FilterConditionView);
  customElements.define(
    'data-view-header-tools-search',
    DataViewHeaderToolsSearch
  );
  customElements.define('filter-group-view', FilterGroupView);
  customElements.define(
    'data-view-header-tools-add-row',
    DataViewHeaderToolsAddRow
  );
  customElements.define('affine-database-new-record-preview', NewRecordPreview);
  customElements.define(
    'data-view-header-tools-filter',
    DataViewHeaderToolsFilter
  );
  customElements.define('data-view-header-tools-sort', DataViewHeaderToolsSort);
  customElements.define(
    'data-view-header-tools-view-options',
    DataViewHeaderToolsViewOptions
  );
  customElements.define('filter-root-view', FilterRootView);
  customElements.define('sort-root-view', SortRootView);
  customElements.define('data-view-header-views', DataViewHeaderViews);
}
