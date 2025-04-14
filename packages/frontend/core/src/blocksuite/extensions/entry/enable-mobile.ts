import { VirtualKeyboardProvider } from '@affine/core/mobile/modules/virtual-keyboard';
import {
  CodeBlockConfigExtension,
  codeToolbarWidget,
} from '@blocksuite/affine/blocks/code';
import { ParagraphBlockConfigExtension } from '@blocksuite/affine/blocks/paragraph';
import type { Container } from '@blocksuite/affine/global/di';
import { DisposableGroup } from '@blocksuite/affine/global/disposable';
import {
  FeatureFlagService,
  VirtualKeyboardProvider as BSVirtualKeyboardProvider,
  type VirtualKeyboardProviderWithAction,
} from '@blocksuite/affine/shared/services';
import type { SpecBuilder } from '@blocksuite/affine/shared/utils';
import { type BlockStdScope, LifeCycleWatcher } from '@blocksuite/affine/std';
import type { ExtensionType } from '@blocksuite/affine/store';
import { SlashMenuExtension } from '@blocksuite/affine/widgets/slash-menu';
import { toolbarWidget } from '@blocksuite/affine/widgets/toolbar';
import { batch, signal } from '@preact/signals-core';
import type { FrameworkProvider } from '@toeverything/infra';

class MobileSpecsPatches extends LifeCycleWatcher {
  static override key = 'mobile-patches';

  constructor(std: BlockStdScope) {
    super(std);
    const featureFlagService = std.get(FeatureFlagService);

    featureFlagService.setFlag('enable_mobile_keyboard_toolbar', true);
    featureFlagService.setFlag('enable_mobile_linked_doc_menu', true);
  }
}

const mobileParagraphConfig = ParagraphBlockConfigExtension({
  getPlaceholder: model => {
    const placeholders = {
      text: '',
      h1: 'Heading 1',
      h2: 'Heading 2',
      h3: 'Heading 3',
      h4: 'Heading 4',
      h5: 'Heading 5',
      h6: 'Heading 6',
      quote: '',
    };
    return placeholders[model.props.type];
  },
});

const mobileCodeConfig = CodeBlockConfigExtension({
  showLineNumbers: false,
});

function KeyboardToolbarExtension(framework: FrameworkProvider): ExtensionType {
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

export function enableMobileExtension(
  specBuilder: SpecBuilder,
  framework: FrameworkProvider
): void {
  specBuilder.omit(codeToolbarWidget);
  specBuilder.omit(toolbarWidget);
  specBuilder.omit(SlashMenuExtension);
  specBuilder.extend([
    MobileSpecsPatches,
    KeyboardToolbarExtension(framework),
    mobileParagraphConfig,
    mobileCodeConfig,
  ]);
}
