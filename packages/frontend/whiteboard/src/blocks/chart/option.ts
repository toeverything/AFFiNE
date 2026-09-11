import { ColorScheme } from '@blocksuite/affine/model';

import { sanitizeEChartsOption } from './sanitize';
import type {
  ChartDataset,
  ChartFormatterPreset,
  ChartType,
  ChartVisualSpec,
  SanitizedEChartsOption,
} from './types';

const LIGHT_COLORS = [
  '#1E96EB',
  '#4F6FED',
  '#7C3AED',
  '#DB2777',
  '#EA580C',
  '#16A34A',
];

const DARK_COLORS = [
  '#5CB3F5',
  '#7B93F5',
  '#A78BFA',
  '#F472B6',
  '#FB923C',
  '#4ADE80',
];

function formatValue(value: unknown, preset?: ChartFormatterPreset): string {
  if (value == null) return '';
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  switch (preset) {
    case 'percent':
      return `${(numeric * 100).toFixed(1)}%`;
    case 'compact':
      return new Intl.NumberFormat(undefined, {
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(numeric);
    case 'date':
      return new Date(numeric).toLocaleDateString();
    case 'number':
    default:
      return new Intl.NumberFormat(undefined, {
        maximumFractionDigits: 2,
      }).format(numeric);
  }
}

function seriesType(chartType: ChartType): string {
  if (chartType === 'area') return 'line';
  return chartType;
}

export function buildChartOption(input: {
  title: string;
  chartType: ChartType;
  spec: ChartVisualSpec;
  dataset: ChartDataset;
  theme: ColorScheme;
  animation: boolean;
}): SanitizedEChartsOption {
  const { title, chartType, spec, dataset, theme, animation } = input;
  const dark = theme === ColorScheme.Dark;
  const colors = spec.colors?.length
    ? spec.colors
    : dark
      ? DARK_COLORS
      : LIGHT_COLORS;
  const [xDim, ...yDims] = dataset.dimensions;
  const seriesNames = spec.series?.length
    ? spec.series.map((item, index) => item.name ?? yDims[index] ?? `s${index}`)
    : yDims;

  const textColor = dark ? '#E0E0E0' : '#121212';
  const mutedColor = dark ? '#A0A0A0' : '#8E8E8E';
  const axisLine = dark ? '#5A5A5A' : '#D0D0D0';

  const baseSeries = seriesNames.map((name, index) => {
    const encodeY = spec.series?.[index]?.y ?? yDims[index] ?? yDims[0];
    const item: Record<string, unknown> = {
      name,
      type: seriesType(chartType),
      encode:
        chartType === 'pie' || chartType === 'funnel'
          ? { itemName: xDim, value: encodeY }
          : chartType === 'heatmap'
            ? { x: xDim, y: encodeY, value: yDims[1] ?? encodeY }
            : { x: xDim, y: encodeY },
      color: spec.series?.[index]?.color ?? colors[index % colors.length],
      label: {
        show: !!spec.labels,
        color: textColor,
        formatter: spec.formatter,
      },
      large: dataset.source.length > 1000,
      progressive: 2000,
      progressiveThreshold: 2000,
      sampling:
        chartType === 'line' || chartType === 'area' ? 'lttb' : undefined,
    };
    if (chartType === 'area') {
      item.areaStyle = { opacity: 0.18 };
    }
    if (chartType === 'radar') {
      item.coordinateSystem = 'radar';
    }
    return item;
  });

  const built: Record<string, unknown> = {
    animation,
    darkMode: dark,
    color: colors,
    backgroundColor: 'transparent',
    title: {
      text: title,
      show: false,
      textStyle: { color: textColor },
    },
    legend: {
      show: spec.legend !== false && chartType !== 'heatmap',
      textStyle: { color: mutedColor },
      top: 0,
    },
    tooltip: {
      trigger: chartType === 'pie' ? 'item' : 'axis',
      valueFormatter: spec.formatter,
    },
    dataset: {
      dimensions: dataset.dimensions,
      source: dataset.source,
    },
    series: baseSeries,
    textStyle: {
      color: textColor,
      fontFamily: 'inherit',
    },
  };

  if (
    chartType !== 'pie' &&
    chartType !== 'funnel' &&
    chartType !== 'radar' &&
    chartType !== 'heatmap'
  ) {
    built.grid = {
      left: 48,
      right: 16,
      top: 36,
      bottom: 32,
      containLabel: true,
    };
    built.xAxis = {
      type: chartType === 'scatter' ? 'value' : 'category',
      name: spec.xAxis?.name,
      axisLabel: { color: mutedColor },
      axisLine: { lineStyle: { color: axisLine } },
    };
    built.yAxis = {
      type: 'value',
      name: spec.yAxis?.name,
      axisLabel: { color: mutedColor, formatter: spec.formatter },
      splitLine: { lineStyle: { color: axisLine } },
    };
  }

  if (chartType === 'radar') {
    const indicators = dataset.source.map(row => ({
      name: String(row[0] ?? ''),
      max: Math.max(
        ...dataset.source.flatMap(item =>
          item.slice(1).map(value => Number(value) || 0)
        ),
        1
      ),
    }));
    built.radar = { indicator: indicators, axisName: { color: mutedColor } };
    built.series = seriesNames.map((name, index) => ({
      name,
      type: 'radar',
      data: [
        {
          name,
          value: dataset.source.map(row => row[index + 1] ?? 0),
        },
      ],
    }));
  }

  if (chartType === 'heatmap') {
    built.visualMap = {
      min: 0,
      max: Math.max(
        ...dataset.source.map(row => Number(row[2] ?? row[1]) || 0),
        1
      ),
      calculable: false,
      orient: 'vertical',
      right: 0,
      inRange: { color: ['#1E96EB22', colors[0]] },
    };
  }

  const merged = {
    ...built,
    ...sanitizeEChartsOption(spec.echarts),
  };

  return applyFormatterPresets(sanitizeEChartsOption(merged), spec.formatter);
}

/**
 * Expands the stored preset names into ECharts callbacks.
 *
 * The persisted spec stays function-free (plan §3.5): presets live in Yjs as
 * plain strings and are only materialised here, on the way into `setOption`.
 */
export function applyFormatterPresets(
  option: SanitizedEChartsOption,
  fallback?: ChartFormatterPreset
): SanitizedEChartsOption {
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (!value || typeof value !== 'object') return value;
    const next: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>
    )) {
      if (
        (key === 'formatter' || key === 'valueFormatter') &&
        typeof child === 'string'
      ) {
        const preset = child as ChartFormatterPreset;
        next[key] = (input: unknown) =>
          formatValue(
            typeof input === 'object' && input && 'value' in input
              ? (input as { value: unknown }).value
              : input,
            preset
          );
        continue;
      }
      next[key] = walk(child);
    }
    return next;
  };

  const result = walk(option) as SanitizedEChartsOption;
  if (fallback && result.tooltip && typeof result.tooltip === 'object') {
    const tooltip = result.tooltip as Record<string, unknown>;
    // `walk` only rewrites explicit formatter strings; apply the spec-level
    // preset to tooltips that declared none.
    tooltip.valueFormatter ??= (value: unknown) => formatValue(value, fallback);
  }
  return result;
}
