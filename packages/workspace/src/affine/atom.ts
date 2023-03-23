import type { AccessTokenMessage } from '@affine/workspace/affine/login';
import { atomWithStorage } from 'jotai/utils';

export const currentAffineUserAtom = atomWithStorage<AccessTokenMessage | null>(
  'affine-user-atom',
  null
);
