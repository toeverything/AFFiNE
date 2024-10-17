import {
  Attributes,
  Counter,
  Histogram,
  Meter,
  MetricOptions,
} from '@opentelemetry/api';

import { getMeter } from './opentelemetry';

type MetricType = 'counter' | 'gauge' | 'histogram';
type Metric<T extends MetricType> = T extends 'counter'
  ? Counter
  : T extends 'gauge'
    ? Histogram
    : T extends 'histogram'
      ? Histogram
      : never;

export type ScopedMetrics = {
  [T in MetricType]: (name: string, opts?: MetricOptions) => Metric<T>;
};
type MetricCreators = {
  [T in MetricType]: (
    meter: Meter,
    name: string,
    opts?: MetricOptions
  ) => Metric<T>;
};

export type KnownMetricScopes =
  | 'socketio'
  | 'gql'
  | 'jwst'
  | 'auth'
  | 'controllers'
  | 'doc'
  | 'sse'
  | 'mail'
  | 'ai';

const metricCreators: MetricCreators = {
  counter(meter: Meter, name: string, opts?: MetricOptions) {
    return meter.createCounter(name, opts);
  },
  gauge(meter: Meter, name: string, opts?: MetricOptions) {
    let value: any;
    let attrs: Attributes | undefined;
    const ob$ = meter.createObservableGauge(name, opts);

    ob$.addCallback(result => {
      result.observe(value, attrs);
    });

    return {
      record: (newValue, newAttrs) => {
        value = newValue;
        attrs = newAttrs;
      },
    } satisfies Histogram;
  },
  histogram(meter: Meter, name: string, opts?: MetricOptions) {
    return meter.createHistogram(name, opts);
  },
};

const scopes = new Map<string, ScopedMetrics>();

function make(scope: string) {
  const meter = getMeter();
  const metrics = new Map<string, { type: MetricType; metric: any }>();
  const prefix = scope + '/';

  function getOrCreate<T extends MetricType>(
    type: T,
    name: string,
    opts?: MetricOptions
  ): Metric<T> {
    name = prefix + name;
    const metric = metrics.get(name);
    if (metric) {
      if (type !== metric.type) {
        throw new Error(
          `Metric ${name} has already been registered as ${metric.type} mode, but get as ${type} again.`
        );
      }

      return metric.metric;
    } else {
      const metric = metricCreators[type](meter, name, opts);
      metrics.set(name, { type, metric });
      return metric;
    }
  }

  return {
    counter(name, opts) {
      return getOrCreate('counter', name, opts);
    },
    gauge(name, opts) {
      return getOrCreate('gauge', name, opts);
    },
    histogram(name, opts) {
      return getOrCreate('histogram', name, opts);
    },
  } satisfies ScopedMetrics;
}

/**
 * @example
 *
 * ```
 * metrics.scope.counter('example_count').add(1, {
 *   attr1: 'example-event'
 * })
 * ```
 */
export const metrics = new Proxy<Record<KnownMetricScopes, ScopedMetrics>>(
  // @ts-expect-error proxied
  {},
  {
    get(_, scopeName: string) {
      let scope = scopes.get(scopeName);
      if (!scope) {
        scope = make(scopeName);
        scopes.set(scopeName, scope);
      }

      return scope;
    },
  }
);

export function stopMetrics() {}
