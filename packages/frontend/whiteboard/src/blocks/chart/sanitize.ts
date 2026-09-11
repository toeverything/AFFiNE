import {
  CHART_FORMATTERS,
  type ChartFormatterPreset,
  type SanitizedEChartsOption,
} from './types';

const BANNED_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'onclick',
  'ondblclick',
  'onmouseover',
  'renderItem',
  'jsMode',
  'extraCssText',
]);

const ROOT_ALLOWLIST = new Set([
  'title',
  'legend',
  'grid',
  'xAxis',
  'yAxis',
  'tooltip',
  'dataset',
  'series',
  'color',
  'visualMap',
  'radar',
  'polar',
  'angleAxis',
  'radiusAxis',
  'dataZoom',
  'toolbox',
  'aria',
  'textStyle',
  'animation',
  'animationDuration',
  'backgroundColor',
  'darkMode',
  'media',
]);

const NESTED_ALLOWLIST = new Set([
  ...ROOT_ALLOWLIST,
  'name',
  'type',
  'data',
  'encode',
  'stack',
  'areaStyle',
  'itemStyle',
  'lineStyle',
  'label',
  'labelLine',
  'emphasis',
  'symbol',
  'symbolSize',
  'smooth',
  'large',
  'progressive',
  'progressiveThreshold',
  'sampling',
  'coordinateSystem',
  'radarIndex',
  'xAxisIndex',
  'yAxisIndex',
  'show',
  'orient',
  'left',
  'right',
  'top',
  'bottom',
  'width',
  'height',
  'padding',
  'itemGap',
  'text',
  'subtext',
  'left',
  'formatter',
  'valueFormatter',
  'trigger',
  'axisPointer',
  'containLabel',
  'boundaryGap',
  'min',
  'max',
  'splitLine',
  'axisLabel',
  'axisTick',
  'axisLine',
  'indicator',
  'max',
  'min',
  'dimensions',
  'source',
  'sourceHeader',
  'color',
  'opacity',
  'borderColor',
  'borderWidth',
  'fontSize',
  'fontWeight',
  'fontFamily',
  'align',
  'verticalAlign',
  'position',
  'rotate',
  'distance',
  'feature',
  'saveAsImage',
  'inRange',
  'outOfRange',
  'dimension',
  'min',
  'max',
  'calculable',
  'realtime',
  'text',
  'data',
]);

const FORMATTER_PRESETS = new Set<string>(CHART_FORMATTERS);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function looksLikeScript(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.startsWith('function') ||
    trimmed.startsWith('=>') ||
    trimmed.startsWith('js:') ||
    trimmed.includes('javascript:') ||
    /<\/?script/i.test(trimmed)
  );
}

function sanitizeFormatter(value: unknown): ChartFormatterPreset | undefined {
  if (typeof value !== 'string') return undefined;
  return FORMATTER_PRESETS.has(value)
    ? (value as ChartFormatterPreset)
    : undefined;
}

function sanitizeNode(
  value: unknown,
  key: string | undefined,
  root: boolean
): unknown {
  if (typeof value === 'function') return undefined;
  if (value === undefined || value === null) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    if (key === 'formatter' || key === 'valueFormatter') {
      return sanitizeFormatter(value);
    }
    if (looksLikeScript(value)) return undefined;
    if (
      (key === 'formatter' || key === 'extraCssText') &&
      /<[^>]+>/.test(value)
    ) {
      return undefined;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map(item => sanitizeNode(item, key, false))
      .filter(item => item !== undefined);
  }

  if (!isPlainObject(value)) return undefined;

  const allow = root ? ROOT_ALLOWLIST : NESTED_ALLOWLIST;
  const next: Record<string, unknown> = {};

  for (const [childKey, childValue] of Object.entries(value)) {
    if (BANNED_KEYS.has(childKey)) continue;
    if (!allow.has(childKey)) continue;
    const sanitized = sanitizeNode(childValue, childKey, false);
    if (sanitized !== undefined) {
      next[childKey] = sanitized;
    }
  }

  return next;
}

/**
 * Drop functions, JS formatters and arbitrary HTML from an ECharts option.
 * Named formatter presets (`number` | `percent` | `compact` | `date`) are kept.
 */
export function sanitizeEChartsOption(input: unknown): SanitizedEChartsOption {
  let raw = input;
  try {
    raw = JSON.parse(JSON.stringify(input ?? {}));
  } catch {
    raw = {};
  }

  const sanitized = sanitizeNode(raw, undefined, true);
  return isPlainObject(sanitized) ? sanitized : {};
}

export function isFormatterPreset(
  value: unknown
): value is ChartFormatterPreset {
  return typeof value === 'string' && FORMATTER_PRESETS.has(value);
}
