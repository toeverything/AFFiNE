import { VirtualKeyboardProvider } from '@affine/core/mobile/modules/virtual-keyboard';
import type { Container } from '@blocksuite/affine/global/di';
import { DisposableGroup } from '@blocksuite/affine/global/disposable';
import {
  VirtualKeyboardProvider as BSVirtualKeyboardProvider,
  type VirtualKeyboardProviderWithAction,
} from '@blocksuite/affine/shared/services';
import { LifeCycleWatcher } from '@blocksuite/affine/std';
import type { ExtensionType } from '@blocksuite/affine/store';
import { batch, signal } from '@preact/signals-core';
import type { FrameworkProvider } from '@toeverything/infra';

export function KeyboardToolbarExtension(
  framework: FrameworkProvider
): ExtensionType {
  const affineVirtualKeyboardProvider = framework.get(VirtualKeyboardProvider);

  class BSVirtualKeyboardService
    extends LifeCycleWatcher
    implements BSVirtualKeyboardProvider
  {
    static override key = BSVirtualKeyboardProvider.identifierName;

    private readonly _disposables = new DisposableGroup();

    // eslint-disable-next-line rxjs/finnish
    readonly visible$ = signal(false);

    // eslint-disable-next-line rxjs/finnish
    readonly height$ = signal(0);

    static override setup(di: Container) {
      super.setup(di);
      di.addImpl(BSVirtualKeyboardProvider, provider => {
        return provider.get(this);
      });
    }

    override mounted() {
      this._disposables.add(
        affineVirtualKeyboardProvider.onChange(({ visible, height }) => {
          batch(() => {
            this.visible$.value = visible;
            this.height$.value = height;
          });
        })
      );
    }

    override unmounted() {
      this._disposables.dispose();
    }
  }

  if ('show' in affineVirtualKeyboardProvider) {
    const providerWithAction = affineVirtualKeyboardProvider;

    class BSVirtualKeyboardServiceWithShowAndHide
      extends BSVirtualKeyboardService
      implements VirtualKeyboardProviderWithAction
    {
      show() {
        providerWithAction.show();
      }

      hide() {
        providerWithAction.hide();
      }
    }

    return BSVirtualKeyboardServiceWithShowAndHide;
  }

  return BSVirtualKeyboardService;
}
