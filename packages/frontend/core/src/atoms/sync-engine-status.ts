import type { SyncEngineStatus } from '@affine/workspace';
import { atom } from 'jotai';

export const syncEngineStatusAtom = atom<SyncEngineStatus | null>(null);
