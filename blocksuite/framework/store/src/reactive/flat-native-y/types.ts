import type { Subject } from 'rxjs';
import type { Map as YMap } from 'yjs';

import type { UnRecord } from '../types';

export type OnChange = (key: string, isLocal: boolean) => void;
export type Transform = (
  key: string,
  value: unknown,
  origin: unknown
) => unknown;

export type CreateProxyOptions = {
  yMap: YMap<unknown>;
  base: UnRecord;
  root: UnRecord;
  basePath?: string;
  onChange?: OnChange;
  transform: Transform;
  onDispose: Subject<void>;
  shouldByPassSignal: () => boolean;
  shouldByPassYjs: () => boolean;
  byPassSignalUpdate: (fn: () => void) => void;
  stashed: Set<string | number>;
  initialized: () => boolean;
};
