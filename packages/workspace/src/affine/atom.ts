import { atomWithStorage } from 'jotai/utils';

import type { AccessTokenMessage } from '../affine/login';

export const currentAffineUserAtom = atomWithStorage<AccessTokenMessage | null>(
  'affine-user-atom',
  null
);
