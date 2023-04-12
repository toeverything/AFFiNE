import { currentAffineUserAtom } from '@affine/workspace/affine/atom';
import type { AccessTokenMessage } from '@affine/workspace/affine/login';
import { useAtomValue } from 'jotai';

export function useCurrentUser(): AccessTokenMessage | null {
  return useAtomValue(currentAffineUserAtom);
}
