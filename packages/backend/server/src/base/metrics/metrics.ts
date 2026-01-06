import {
  Gauge,
  Histogram,
  Meter,
  MeterProvider,
  MetricOptions,
  metrics as otelMetrics,
  UpDownCounter,
} from '@opentelemetry/api';
import { HostMetrics } from '@opentelemetry/host-metrics';

function getMeterProvider() {
  return otelMetrics.getMeterProvider();
}

export function registerCustomMetrics() {
  const hostMetricsMonitoring = new HostMetrics({
    name: 'instance-host-metrics',
    meterProvider: getMeterProvider() as MeterProvider,
  });
  hostMetricsMonitoring.start();
}

export function getMeter(name = 'business') {
  return getMeterProvider().getMeter(name);
}

type MetricType = 'counter' | 'gauge' | 'histogram';
type Metric<T extends MetricType> = T extends 'counter'
  ? UpDownCounter
  : T extends 'gauge'
    ? Gauge
    : T extends 'histogram'
      ? Histogram
      : never;

export type ScopedMetrics = {
  counter: (name: string, opts?: MetricOptions) => UpDownCounter;
  gauge: (name: string, opts?: MetricOptions) => Gauge;
  histogram: (name: string, opts?: MetricOptions) => Histogram;
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
  | 'ai'
  | 'event'
  | 'queue'
  | 'storage'
  | 'process'
  | 'workspace';

const metricCreators: MetricCreators = {
  counter(meter: Meter, name: string, opts?: MetricOptions) {
    return meter.createCounter(name, opts);
  },
  gauge(meter: Meter, name: string, opts?: MetricOptions) {
    return meter.createGauge(name, opts);
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
