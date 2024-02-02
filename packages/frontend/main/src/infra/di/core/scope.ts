import { ROOT_SCOPE } from './consts';
import type { ServiceScope } from './types';

export function createScope(
  name: string,
  base: ServiceScope = ROOT_SCOPE
): ServiceScope {
  return [...base, name];
}

export function stringifyScope(scope: ServiceScope): string {
  return scope.join('/');
}
