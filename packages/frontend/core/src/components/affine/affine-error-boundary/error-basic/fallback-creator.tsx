import type { FC } from 'react';

export interface FallbackProps<T = unknown> {
  error: T;
  resetError?: () => void;
}

export const ERROR_REFLECT_KEY = Symbol('ERROR_REFLECT_KEY');

export function createErrorFallback<T extends Error>(
  ErrorConstructor: abstract new (...args: any[]) => T,
  Component: FC<FallbackProps<T>>
): FC<FallbackProps<T>> {
  Reflect.set(Component, ERROR_REFLECT_KEY, ErrorConstructor);
  return Component;
}
