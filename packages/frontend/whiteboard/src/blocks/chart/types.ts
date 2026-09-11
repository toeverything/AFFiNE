export const CHART_TYPES = [
  'bar',
  'line',
  'area',
  'pie',
  'scatter',
  'funnel',
  'radar',
  'heatmap',
] as const;

export type ChartType = (typeof CHART_TYPES)[number];

export const CHART_DATA_SOURCE_TYPES = [
  'database',
  'inline',
  'csv-blob',
  'http',
] as const;

export type ChartDataSourceType = (typeof CHART_DATA_SOURCE_TYPES)[number];

export const CHART_FORMATTERS = [
  'number',
  'percent',
  'compact',
  'date',
] as const;

export type ChartFormatterPreset = (typeof CHART_FORMATTERS)[number];

export type ChartMapping = {
  x: string;
  y: string[];
  series?: string;
  category?: string;
};

export type ChartInlineTable = {
  columns: string[];
  rows: Array<Array<string | number | null>>;
};

export type ChartDataSource = {
  type: ChartDataSourceType;
  docId?: string;
  blockId?: string;
  viewId?: string;
  blobId?: string;
  url?: string;
  httpAllowlist?: string[];
  mapping: ChartMapping;
  refreshMs?: number;
  inline?: ChartInlineTable;
};

export type ChartSeriesSpec = {
  name?: string;
  y?: string;
  color?: string;
};

export type ChartVisualSpec = {
  legend?: boolean;
  labels?: boolean;
  colors?: string[];
  xAxis?: { name?: string };
  yAxis?: { name?: string };
  formatter?: ChartFormatterPreset;
  series?: ChartSeriesSpec[];
  echarts?: Record<string, unknown>;
};

export type SanitizedEChartsOption = Record<string, unknown>;

export type ChartDataset = {
  dimensions: string[];
  source: Array<Array<string | number | null>>;
};

export type DatabaseColumnMeta = {
  id: string;
  name: string;
  type?: string;
};

export type DatabaseViewMeta = {
  id: string;
  name: string;
};

export type ChartDatabaseOption = {
  id: string;
  title: string;
  docId: string;
  columns: DatabaseColumnMeta[];
  views: DatabaseViewMeta[];
};

export type DatabaseRowSnapshot = {
  id: string;
  title?: string;
  cells: Record<string, unknown>;
};

export type DatabaseTableSnapshot = {
  columns: DatabaseColumnMeta[];
  rows: DatabaseRowSnapshot[];
};

export const DEFAULT_CHART_MAPPING: ChartMapping = {
  x: 'Month',
  y: ['Revenue', 'Cost'],
};

export const DEFAULT_INLINE_TABLE: ChartInlineTable = {
  columns: ['Month', 'Revenue', 'Cost'],
  rows: [
    ['Jan', 12, 8],
    ['Feb', 15, 9],
    ['Mar', 18, 11],
    ['Apr', 14, 10],
  ],
};

export function createDefaultDataSource(): ChartDataSource {
  return {
    type: 'inline',
    mapping: { ...DEFAULT_CHART_MAPPING, y: [...DEFAULT_CHART_MAPPING.y] },
    inline: {
      columns: [...DEFAULT_INLINE_TABLE.columns],
      rows: DEFAULT_INLINE_TABLE.rows.map(row => [...row]),
    },
  };
}

export function createDefaultSpec(): ChartVisualSpec {
  return {
    legend: true,
    labels: false,
    formatter: 'number',
    echarts: {},
  };
}
