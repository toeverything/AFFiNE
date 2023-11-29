import opentelemetry, { Attributes, Observable } from '@opentelemetry/api';

interface AsyncMetric {
  ob: Observable;
  get value(): any;
  get attrs(): Attributes | undefined;
}

let _metrics: ReturnType<typeof createBusinessMetrics> | undefined = undefined;

export function getMeter(name = 'business') {
  return opentelemetry.metrics.getMeter(name);
}

function createBusinessMetrics() {
  const meter = getMeter();
  const asyncMetrics: AsyncMetric[] = [];

  function createGauge(name: string) {
    let value: any;
    let attrs: Attributes | undefined;
    const ob = meter.createObservableGauge(name);
    asyncMetrics.push({
      ob,
      get value() {
        return value;
      },
      get attrs() {
        return attrs;
      },
    });

    return (newValue: any, newAttrs?: Attributes) => {
      value = newValue;
      attrs = newAttrs;
    };
  }

  const metrics = {
    socketIOConnectionGauge: createGauge('socket_io_connection'),

    gqlRequest: meter.createCounter('gql_request'),
    gqlError: meter.createCounter('gql_error'),
    gqlTimer: meter.createHistogram('gql_timer'),

    jwstCodecMerge: meter.createCounter('jwst_codec_merge'),
    jwstCodecDidnotMatch: meter.createCounter('jwst_codec_didnot_match'),
    jwstCodecFail: meter.createCounter('jwst_codec_fail'),

    authCounter: meter.createCounter('auth'),
    authFailCounter: meter.createCounter('auth_fail'),

    docHistoryCounter: meter.createCounter('doc_history_created'),
    docRecoverCounter: meter.createCounter('doc_history_recovered'),
  };

  meter.addBatchObservableCallback(
    result => {
      asyncMetrics.forEach(metric => {
        result.observe(metric.ob, metric.value, metric.attrs);
      });
    },
    asyncMetrics.map(({ ob }) => ob)
  );

  return metrics;
}

export function registerBusinessMetrics() {
  if (!_metrics) {
    _metrics = createBusinessMetrics();
  }

  return _metrics;
}
export const metrics = registerBusinessMetrics;
