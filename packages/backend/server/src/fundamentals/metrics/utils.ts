import { Attributes } from '@opentelemetry/api';

import { KnownMetricScopes, metrics } from './metrics';

export const CallTimer = (
  scope: KnownMetricScopes,
  name: string,
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
      metrics[scope]
        .counter(`${name}_calls`, {
          description: `function call counts of ${name}`,
        })
        .add(1, attrs);

      const start = Date.now();

      const end = () => {
        timer.record(Date.now() - start, attrs);
      };

      try {
        return await originalMethod.apply(this, args);
      } finally {
        end();
      }
    };

    return desc;
  };
};

export const CallCounter = (
  scope: KnownMetricScopes,
  name: string,
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

    desc.value = function (...args: any[]) {
      const count = metrics[scope].counter(name, {
        description: `function call counter of ${name}`,
      });

      count.add(1, attrs);
      return originalMethod.apply(this, args);
    };

    return desc;
  };
};
