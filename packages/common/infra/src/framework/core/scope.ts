import type { FrameworkScopeStack } from './types';

export function stringifyScope(scope: FrameworkScopeStack): string {
  return scope.join('/');
}
