import { atomWithSyncStorage } from '@affine/jotai';
import type { AccessTokenMessage } from '@affine/workspace/affine/login';

export const currentAffineUserAtom =
  atomWithSyncStorage<AccessTokenMessage | null>('affine-user-atom', null);
