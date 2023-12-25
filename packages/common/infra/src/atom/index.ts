import { atom } from 'jotai';

export const loadedPluginNameAtom = atom<string[]>([]);

export * from './root-store';
export * from './settings';
