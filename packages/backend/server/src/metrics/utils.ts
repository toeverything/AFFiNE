import { Counter, Gauge, Summary } from 'prom-client';

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
    const counter = new Counter({
      name,
      help: name,
      ...(labelNames ? { labelNames } : {}),
    });

    return (value: number, labels: LabelValues<T>) => {
      counter.inc(labels, value);
    };
  };

  const gaugeCreator = <T extends string>(
    name: string,
    labelNames?: T[]
  ): MetricsCreator<T> => {
    const gauge = new Gauge({
      name,
      help: name,
      ...(labelNames ? { labelNames } : {}),
    });

    return (value: number, labels: LabelValues<T>) => {
      gauge.set(labels, value);
    };
  };

  const timerCreator = <T extends string>(
    name: string,
    labelNames?: T[]
  ): TimerMetricsCreator<T> => {
    const summary = new Summary({
      name,
      help: name,
      ...(labelNames ? { labelNames } : {}),
    });

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
