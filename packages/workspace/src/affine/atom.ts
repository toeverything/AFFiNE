/**
 * @deprecated Remove this file after we migrate to the new cloud.
 */
import { atomWithStorage } from 'jotai/utils';

import type { AccessTokenMessage } from '../affine/login';

export const currentAffineUserAtom = atomWithStorage<AccessTokenMessage | null>(
  'affine-user-atom',
  null
);
