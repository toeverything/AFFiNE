import { atom } from 'jotai';
import type { SessionContextValue } from 'next-auth/react';

export const sessionAtom = atom<SessionContextValue<true> | null>(null);
