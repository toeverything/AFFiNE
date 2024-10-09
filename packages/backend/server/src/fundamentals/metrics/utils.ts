import type { Attributes } from '@opentelemetry/api';

import { type KnownMetricScopes, metrics } from './metrics';

/**
 * Decorator for measuring the call time, record call count and if is throw of a function call
 * @param scope metric scope
 * @param name metric event name
 * @param attrs attributes
 * @returns
 */
export const CallMetric = (
  scope: KnownMetricScopes,
  name: string,
  record?: { timer?: boolean; count?: boolean; error?: boolean },
  attrs?: Attributes
): MethodDecorator => {
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

    desc.value = async function (...args: any[]) {
      const timer = metrics[scope].histogram(name, {
        description: `function call time costs of ${name}`,
        unit: 'ms',
      });
      const count = metrics[scope].counter(`${name}_calls`, {
        description: `function call counter of ${name}`,
      });
      const errorCount = metrics[scope].counter(`${name}_errors`, {
        description: `function call error counter of ${name}`,
      });

      const start = Date.now();
      const end = () => {
        timer?.record(Date.now() - start, attrs);
      };

      try {
        if (!record || !!record.count) {
          count.add(1, attrs);
        }
        return await originalMethod.apply(this, args);
      } catch (err) {
        if (!record || !!record.error) {
          errorCount.add(1, attrs);
        }
        throw err;
      } finally {
        if (!record || !!record.timer) {
          end();
        }
      }
    };

    return desc;
  };
};
