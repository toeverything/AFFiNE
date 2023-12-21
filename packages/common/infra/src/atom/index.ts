import { atom } from 'jotai';

export const loadedPluginNameAtom = atom<string[]>([]);

export * from './layout';
export * from './root-store';
export * from './settings';
export * from './workspace';
