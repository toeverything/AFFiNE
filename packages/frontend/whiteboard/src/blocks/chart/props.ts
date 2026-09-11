import { Boxed, type Text } from '@blocksuite/affine/store';

import {
  type ChartDataSource,
  type ChartVisualSpec,
  createDefaultDataSource,
  createDefaultSpec,
} from './types';

export function isBoxed<T>(value: unknown): value is Boxed<T> {
  return value instanceof Boxed;
}

export function readBoxed<T>(value: Boxed<T> | T | undefined, fallback: T): T {
  if (value == null) return fallback;
  if (isBoxed<T>(value)) {
    return (value.getValue() as T | undefined) ?? fallback;
  }
  return value;
}

export function writeBoxed<T>(
  target: Boxed<T> | T | undefined,
  next: T
): Boxed<T> {
  if (isBoxed<T>(target)) {
    target.setValue(next);
    return target;
  }
  return new Boxed(next);
}

export function readTitle(title: Text | string | undefined): string {
  if (!title) return '';
  if (typeof title === 'string') return title;
  return title.toString();
}

export function writeTitle(title: Text | string | undefined, next: string) {
  if (!title || typeof title === 'string') return;
  if (title.length) {
    title.replace(0, title.length, next);
  } else {
    title.insert(next, 0);
  }
}

export function readSpec(value: unknown): ChartVisualSpec {
  const spec = readBoxed<ChartVisualSpec>(
    value as Boxed<ChartVisualSpec> | ChartVisualSpec | undefined,
    createDefaultSpec()
  );
  return {
    ...createDefaultSpec(),
    ...spec,
    echarts: spec.echarts ?? {},
  };
}

export function readDataSource(value: unknown): ChartDataSource {
  const source = readBoxed<ChartDataSource>(
    value as Boxed<ChartDataSource> | ChartDataSource | undefined,
    createDefaultDataSource()
  );
  const fallback = createDefaultDataSource();
  return {
    ...fallback,
    ...source,
    mapping: {
      ...fallback.mapping,
      ...source.mapping,
      y: source.mapping?.y?.length
        ? [...source.mapping.y]
        : [...fallback.mapping.y],
    },
    inline: source.inline ?? fallback.inline,
  };
}
