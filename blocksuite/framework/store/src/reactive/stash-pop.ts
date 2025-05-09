import type { Array as YArray, Map as YMap } from 'yjs';

import { proxies } from './memory';

export function stashProp(yMap: YMap<unknown>, prop: string): void;
export function stashProp(yMap: YArray<unknown>, prop: number): void;
export function stashProp(yAbstract: unknown, prop: string | number) {
  const proxy = proxies.get(yAbstract);
  proxy?.stash(prop);
}

export function popProp(yMap: YMap<unknown>, prop: string): void;
export function popProp(yMap: YArray<unknown>, prop: number): void;
export function popProp(yAbstract: unknown, prop: string | number) {
  const proxy = proxies.get(yAbstract);
  proxy?.pop(prop);
}
