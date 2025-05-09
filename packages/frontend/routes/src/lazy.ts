import React, {
  type ComponentProps,
  type ComponentType,
  lazy as reactLazy,
  Suspense,
} from 'react';

export function lazy<T extends ComponentType<any>>(
  factory: () => Promise<Record<any, T>>,
  fallback?: React.ReactNode
) {
  const LazyComponent = reactLazy(() =>
    factory().then(mod => {
      if ('default' in mod) {
        return { default: mod.default };
      } else {
        const components = Object.values(mod);
        if (components.length > 1) {
          console.warn('Lazy loaded module has more then one exports');
        }
        return {
          default: components[0],
        };
      }
    })
  );

  return function LazyRoute(props: ComponentProps<T>) {
    return React.createElement(
      Suspense,
      {
        fallback,
      },
      React.createElement(LazyComponent, props)
    );
  };
}
