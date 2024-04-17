import { toast } from '@affine/component';
import {
  PreconditionStrategy,
  registerAffineCommand,
  useService,
} from '@toeverything/infra';
import { useEffect } from 'react';
import i18n from 'i18next';
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
        category: 'affine:general',
        preconditionStrategy: PreconditionStrategy.Never,
        keyBinding: {
          binding: '$mod+s',
        },
        label: '',
        icon: null,
        run() {
          const savingMessage = i18n.t('Save') || 'save';
          toast(savingMessage);
        },
      })
    );

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [navigator]);
}
