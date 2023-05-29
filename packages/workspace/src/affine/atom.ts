import { atomWithStorage } from 'jotai/utils';

import type { AccessTokenMessage } from './login';

export const currentAffineUserAtom = atomWithStorage<AccessTokenMessage | null>(
  'affine-user-atom',
  null
);
