import { Button } from '@affine/component';
import { useSetAtom } from 'jotai';
import type { ReactElement } from 'react';
import { useCallback } from 'react';

import { contentExpandAtom } from './jotai';

export const HeaderItem = (): ReactElement => {
  const set = useSetAtom(contentExpandAtom);
  return (
    <Button onClick={useCallback(() => set(expand => !expand), [set])}>
      Chat With AI
    </Button>
  );
};
