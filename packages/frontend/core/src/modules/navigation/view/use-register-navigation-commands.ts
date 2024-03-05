import {
  PreconditionStrategy,
  registerAffineCommand,
} from '@toeverything/infra/command';
import { useService } from '@toeverything/infra/di';
import { useEffect } from 'react';

import { Navigator } from '../entities/navigator';

export function useRegisterNavigationCommands() {
  const navigator = useService(Navigator);
  useEffect(() => {
    const unsubs: Array<() => void> = [];

    unsubs.push(
      registerAffineCommand({
        id: 'affine:shortcut-history-go-back',
        category: 'affine:general',
        preconditionStrategy: PreconditionStrategy.Never,
        icon: 'none',
        label: 'go back',
        keyBinding: {
          binding: '$mod+[',
        },
        run() {
          navigator.back();
        },
      })
    );
    unsubs.push(
      registerAffineCommand({
        id: 'affine:shortcut-history-go-forward',
        category: 'affine:general',
        preconditionStrategy: PreconditionStrategy.Never,
        icon: 'none',
        label: 'go forward',
        keyBinding: {
          binding: '$mod+]',
        },
        run() {
          navigator.forward();
        },
      })
    );

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [navigator]);
}
