import type { AccessTokenMessage } from '@affine/workspace/affine/login';
import { atom } from 'jotai';

export const currentAffineUserAtom = atom<AccessTokenMessage | null>(null);
