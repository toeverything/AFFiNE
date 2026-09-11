import { describe, expect, it } from 'vitest';

import { sanitizeEChartsOption } from './sanitize';

describe('sanitizeEChartsOption', () => {
  it('drops functions and prototype keys', () => {
    const sanitized = sanitizeEChartsOption({
      title: { text: 'Revenue' },
      tooltip: {
        formatter: () => 'hack',
        extraCssText: 'background:url(javascript:alert(1))',
      },
      series: [
        {
          type: 'bar',
          renderItem: () => null,
          data: [1, 2, 3],
        },
      ],
      constructor: { evil: true },
      __proto__: { polluted: true },
    });

    expect(sanitized.title).toEqual({ text: 'Revenue' });
    expect(sanitized.series).toEqual([{ type: 'bar', data: [1, 2, 3] }]);
    expect(sanitized.tooltip).toEqual({});
    expect(sanitized).not.toHaveProperty('constructor');
    expect(sanitized).not.toHaveProperty('__proto__');
  });

  it('keeps named formatter presets and strips js formatters', () => {
    const sanitized = sanitizeEChartsOption({
      tooltip: { valueFormatter: 'percent' },
      yAxis: { axisLabel: { formatter: 'function (v) { return v; }' } },
      series: [{ type: 'line', label: { formatter: 'compact' } }],
    });

    expect(
      (sanitized.tooltip as { valueFormatter: string }).valueFormatter
    ).toBe('percent');
    expect(
      (sanitized.series as Array<{ label: { formatter?: string } }>)[0].label
        .formatter
    ).toBe('compact');
    expect(
      (sanitized.yAxis as { axisLabel: { formatter?: string } }).axisLabel
        .formatter
    ).toBeUndefined();
  });

  it('ignores unknown root keys and invalid json-like values', () => {
    const sanitized = sanitizeEChartsOption({
      notAChartKey: { foo: 1 },
      color: ['#111', '#222'],
    });

    expect(sanitized.color).toEqual(['#111', '#222']);
    expect(sanitized).not.toHaveProperty('notAChartKey');
  });
});
