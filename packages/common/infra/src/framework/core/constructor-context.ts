import type { FrameworkProvider } from './provider';

interface Context {
  provider?: FrameworkProvider;
  props?: any;
}

export const CONSTRUCTOR_CONTEXT: {
  current: Context;
} = { current: {} };

/**
 * @internal
 */
export function withContext<T>(cb: () => T, context: Context): T {
  const pre = CONSTRUCTOR_CONTEXT.current;
  try {
    CONSTRUCTOR_CONTEXT.current = context;
    return cb();
  } finally {
    CONSTRUCTOR_CONTEXT.current = pre;
  }
}
