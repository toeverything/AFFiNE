import { atom } from 'jotai';

export const globalContextAtom = atom({
  fetch: null! as typeof globalThis.fetch,
});
