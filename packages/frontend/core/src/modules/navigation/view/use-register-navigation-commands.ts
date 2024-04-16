import { toast } from '@affine/component';
import {
  PreconditionStrategy,
  registerAffineCommand,
  useService,
} from '@toeverything/infra';
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

    unsubs.push(
      registerAffineCommand({
        id: 'alert-ctrl-s',
        category: 'hidden',
        preconditionStrategy: PreconditionStrategy.Always,
        keyBinding: {
          binding: '$mod+s',
        },
        label: 'Ignore Mod+S',
        icon: null,
        run() {
          toast('save');
        },
      })
    );

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [navigator]);
}
