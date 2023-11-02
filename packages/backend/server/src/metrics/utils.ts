import { Counter, Gauge, register, Summary } from 'prom-client';

function getOr<T>(name: string, or: () => T): T {
  return (register.getSingleMetric(name) as T) || or();
}

type LabelValues<T extends string> = Partial<Record<T, string | number>>;
type MetricsCreator<T extends string> = (
  value: number,
  labels: LabelValues<T>
) => void;
type TimerMetricsCreator<T extends string> = (
  labels: LabelValues<T>
) => () => number;

export const metricsCreatorGenerator = () => {
  const counterCreator = <T extends string>(
    name: string,
    labelNames?: T[]
  ): MetricsCreator<T> => {
    const counter = getOr(
      name,
      () =>
        new Counter({
          name,
          help: name,
          ...(labelNames ? { labelNames } : {}),
        })
    );

    return (value: number, labels: LabelValues<T>) => {
      counter.inc(labels, value);
    };
  };

  const gaugeCreator = <T extends string>(
    name: string,
    labelNames?: T[]
  ): MetricsCreator<T> => {
    const gauge = getOr(
      name,
      () =>
        new Gauge({
          name,
          help: name,
          ...(labelNames ? { labelNames } : {}),
        })
    );

    return (value: number, labels: LabelValues<T>) => {
      gauge.set(labels, value);
    };
  };

  const timerCreator = <T extends string>(
    name: string,
    labelNames?: T[]
  ): TimerMetricsCreator<T> => {
    const summary = getOr(
      name,
      () =>
        new Summary({
          name,
          help: name,
          ...(labelNames ? { labelNames } : {}),
        })
    );

    return (labels: LabelValues<T>) => {
      const now = process.hrtime();

      return () => {
        const delta = process.hrtime(now);
        const value = delta[0] + delta[1] / 1e9;

        summary.observe(labels, value);
        return value;
      };
    };
  };

  return {
    counter: counterCreator,
    gauge: gaugeCreator,
    timer: timerCreator,
  };
};

export const metricsCreator = metricsCreatorGenerator();

export const CallTimer = (
  name: string,
  labels: Record<string, any> = {}
): MethodDecorator => {
  const timer = metricsCreator.timer(name, Object.keys(labels));

  // @ts-expect-error allow
  return (
    _target,
    _key,
    desc: TypedPropertyDescriptor<(...args: any[]) => any>
  ) => {
    const originalMethod = desc.value;
    if (!originalMethod) {
      return desc;
    }

    desc.value = function (...args: any[]) {
      const endTimer = timer(labels);
      let result: any;
      try {
        result = originalMethod.apply(this, args);
      } catch (e) {
        endTimer();
        throw e;
      }

      if (result instanceof Promise) {
        return result.finally(endTimer);
      } else {
        endTimer();
        return result;
      }
    };

    return desc;
  };
};

export const CallCounter = (
  name: string,
  labels: Record<string, any> = {}
): MethodDecorator => {
  const count = metricsCreator.counter(name, Object.keys(labels));

  // @ts-expect-error allow
  return (
    _target,
    _key,
    desc: TypedPropertyDescriptor<(...args: any[]) => any>
  ) => {
    const originalMethod = desc.value;
    if (!originalMethod) {
      return desc;
    }

    desc.value = function (...args: any[]) {
      count(1, labels);
      return originalMethod.apply(this, args);
    };

    return desc;
  };
};
