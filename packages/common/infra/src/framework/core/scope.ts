import type { FrameworkScopeStack } from './types';

export function stringifyScope(scopeStack: FrameworkScopeStack): string {
  return scopeStack.reduce(
    (str: string, scope) =>
      str + (typeof scope === 'string' ? scope : scope.name) + '/',
    '/'
  );
}
