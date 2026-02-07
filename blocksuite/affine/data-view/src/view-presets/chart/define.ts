import type { BasicViewDataType } from '../../core/view/data-view.js';
import { viewType } from '../../core/view/data-view.js';
import { ChartSingleView } from './chart-view-manager.js';

export const chartViewType = viewType('chart');

export type ChartType =
  | 'pie'
  | 'bar'
  | 'horizontal-bar'
  | 'stacked-bar'
  | 'line';

export type ChartViewData = BasicViewDataType<
  typeof chartViewType.type,
  {
    /** Property ID to group rows by (e.g. a "status" property). */
    categoryPropertyId?: string;
    /** How to display the chart (pie, bar, etc.). */
    chartType?: ChartType;
    /** Sort order for chart data */
    sortBy?:
      | 'manual'
      | 'status-asc'
      | 'status-desc'
      | 'count-low-high'
      | 'count-high-low';
    /** Color scheme for the chart */
    colorScheme?:
      | 'auto'
      | 'colorful'
      | 'colorless'
      | 'blue'
      | 'yellow'
      | 'green'
      | 'purple'
      | 'teal'
      | 'orange'
      | 'pink'
      | 'red';
    /** Chart height */
    height?: 'Small' | 'Medium' | 'Large';
    /** Whether to show value in center (for pie/doughnut) */
    showValueInCenter?: boolean;
    /** Whether to show legend */
    showLegend?: boolean;
    /** Data label display mode */
    dataLabels?: 'None' | 'Value' | 'Value (%)';
    /** Whether to show caption */
    showCaption?: boolean;
    /** Caption text */
    captionText?: string;
    /** X axis property for bar/line charts */
    xAxisPropertyId?: string;
    /** X axis sort order */
    xAxisSort?: string;
    /** Y axis range */
    yAxisRange?: 'Auto' | 'Custom';
    /** Custom Y axis min value */
    yAxisMin?: number;
    /** Custom Y axis max value */
    yAxisMax?: number;
    /** Grid line display mode for line charts */
    gridLine?: 'none' | 'horizontal' | 'vertical' | 'both';
    /** Axis title visibility mode for line charts */
    axisNameMode?: 'none' | 'x' | 'y' | 'both';
    /** Whether line charts use a smoothed/curved stroke */
    smoothLine?: boolean;
    /** Whether to fill the area underneath the line */
    gradientArea?: boolean;
    /** Whether to draw value labels on each data point */
    showDataLabels?: boolean;
  }
>;

export const chartViewModel = chartViewType.createModel<ChartViewData>({
  defaultName: 'Chart View',
  dataViewManager: ChartSingleView,
  defaultData: viewManager => {
    const dataSource = viewManager.dataSource;
    const allProps = dataSource.properties$.value;
    let prop = allProps.find(id => dataSource.propertyNameGet(id) === 'Status');
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
