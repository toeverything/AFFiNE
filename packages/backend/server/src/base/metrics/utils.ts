import type { Attributes } from '@opentelemetry/api';

import { makeMethodDecorator } from '../nestjs/decorator';
import { type KnownMetricScopes, metrics } from './metrics';

/**
 * Decorator for measuring the call time, record call count and if is throw of a function call
 * @param scope metric scope
 * @param name metric event name
 * @param attrs attributes
 * @returns
 */
export const CallMetric = makeMethodDecorator(
  (scope: KnownMetricScopes, name: string, attrs?: Attributes) => {
    return (_target, _key, fn) => {
      return wrapCallMetric(fn, scope, name, attrs);
    };
  }
);

export function wrapCallMetric<Fn extends (...args: any[]) => any>(
  fn: Fn,
  scope: KnownMetricScopes,
  name: string,
  attrs?: Attributes
) {
  return async function (this: any, ...args: any[]) {
    const start = Date.now();
    let error = false;

    try {
      return await fn.call(this, ...args);
    } catch (err) {
      error = true;
      throw err;
    } finally {
      const count = metrics[scope].counter('function_calls', {
        description: 'function call counter',
      });

      const timer = metrics[scope].histogram('function_timer', {
        description: 'function call time costs',
        unit: 'ms',
      });

      count.add(1, { ...attrs, name, error });
      timer.record(Date.now() - start, { ...attrs, name, error });
    }
  };
}
