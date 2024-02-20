import type { SyncEngineStatus } from '@toeverything/infra';
import { atom } from 'jotai';

export const syncEngineStatusAtom = atom<SyncEngineStatus | null>(null);
