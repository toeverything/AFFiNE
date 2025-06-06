import type { BasicViewDataType } from '../../core/view/data-view.js';
import { viewType } from '../../core/view/data-view.js';
import { ChartSingleView } from './chart-view-manager.js';

export const chartViewType = viewType('chart');

export type ChartType = 'pie' | 'bar' | 'stacked-bar' | 'line';

export type ChartViewData = BasicViewDataType<
    typeof chartViewType.type,
    {
        /** Property ID to group rows by (e.g. a “status” property). */
        categoryPropertyId?: string;
        /** How to display the chart (pie, bar, etc.). */
        chartType?: ChartType;
    }
>;

export const chartViewModel = chartViewType.createModel<ChartViewData>({
    defaultName: 'Chart View',
    dataViewManager: ChartSingleView,
    defaultData: viewManager => {
        const dataSource = viewManager.dataSource;
        const allProps = dataSource.properties$.value;
        let prop = allProps.find(
            id => dataSource.propertyNameGet(id) === 'Status'
        );
        if (!prop) {
            prop = allProps.find(id => {
                const type = dataSource.propertyTypeGet(id);
                return type === 'select' || type === 'multi-select';
            });
        }
        if (!prop && allProps.length > 0) {
            prop = allProps[0];
        }
        return {
            mode: 'chart',
            categoryPropertyId: prop,
            chartType: 'pie',
        };
    },
});
