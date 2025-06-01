// AFFiNE/blocksuite/affine/data-view/src/view-presets/chart/define.ts

import type { BasicViewDataType } from '../../core/view/data-view.js';
import { viewType } from '../../core/view/data-view.js';
import { ChartSingleView } from './chart-view-manager.js';

export const chartViewType = viewType('chart');

export type ChartViewData = BasicViewDataType<
    typeof chartViewType.type,
    {
        /** Property ID to group rows by (e.g. a “status” property). */
        categoryPropertyId?: string;
    }
>;

export const chartViewModel = chartViewType.createModel<ChartViewData>({
    defaultName: 'Chart View',
    dataViewManager: ChartSingleView,
    defaultData: viewManager => {
        // By default, pick the first property in the datasource as the category field (if any)
        const allProps = viewManager.dataSource.properties$.value;
        return {
            mode: 'chart',
            categoryPropertyId: allProps.length > 0 ? allProps[0] : undefined,
        };
    },
});
