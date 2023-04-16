import { rootCurrentPageIdAtom } from '@affine/workspace/atom';
import { useAtom } from 'jotai';

/**
 * @deprecated Use `rootCurrentPageIdAtom` directly instead.
 */
export function useCurrentPageId(): [
  string | null,
  (newId: string | null) => void
] {
  return useAtom(rootCurrentPageIdAtom);
}
