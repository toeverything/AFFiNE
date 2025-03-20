import { VirtualKeyboardProvider } from '@affine/core/mobile/modules/virtual-keyboard';
import {
  type BlockStdScope,
  LifeCycleWatcher,
  LifeCycleWatcherIdentifier,
} from '@blocksuite/affine/block-std';
import {
  CodeBlockConfigExtension,
  codeToolbarWidget,
} from '@blocksuite/affine/blocks/code';
import { imageToolbarWidget } from '@blocksuite/affine/blocks/image';
import { ParagraphBlockConfigExtension } from '@blocksuite/affine/blocks/paragraph';
import { surfaceRefToolbarWidget } from '@blocksuite/affine/blocks/surface-ref';
import type {
  Container,
  ServiceIdentifier,
} from '@blocksuite/affine/global/di';
import { DisposableGroup } from '@blocksuite/affine/global/disposable';
import {
  DocModeProvider,
  FeatureFlagService,
  VirtualKeyboardProvider as BSVirtualKeyboardProvider,
} from '@blocksuite/affine/shared/services';
import type { SpecBuilder } from '@blocksuite/affine/shared/utils';
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

    private get _rootContentEditable() {
      const editorMode = this.std.get(DocModeProvider).getEditorMode();
      if (editorMode !== 'page') return null;

      if (!this.std.host.doc.root) return;
      return this.std.view.getBlock(this.std.host.doc.root.id);
    }

    // eslint-disable-next-line rxjs/finnish
    readonly visible$ = signal(false);

    // eslint-disable-next-line rxjs/finnish
    readonly height$ = signal(0);

    show() {
      if ('show' in affineVirtualKeyboardProvider) {
        affineVirtualKeyboardProvider.show();
      } else if (this._rootContentEditable) {
        this._rootContentEditable.inputMode = '';
      }
    }
    hide() {
      if ('hide' in affineVirtualKeyboardProvider) {
        affineVirtualKeyboardProvider.hide();
      } else if (this._rootContentEditable) {
        this._rootContentEditable.inputMode = 'none';
      }
    }

    static override setup(di: Container) {
      super.setup(di);
      di.addImpl(BSVirtualKeyboardProvider, provider => {
        return provider.get(
          LifeCycleWatcherIdentifier(
            this.key
          ) as ServiceIdentifier<BSVirtualKeyboardService>
        );
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

  return BSVirtualKeyboardService;
}

export function enableMobileExtension(
  specBuilder: SpecBuilder,
  framework: FrameworkProvider
): void {
  specBuilder.omit(codeToolbarWidget);
  specBuilder.omit(imageToolbarWidget);
  specBuilder.omit(surfaceRefToolbarWidget);
  specBuilder.omit(toolbarWidget);
  specBuilder.omit(SlashMenuExtension);
  specBuilder.extend([
    MobileSpecsPatches,
    KeyboardToolbarExtension(framework),
    mobileParagraphConfig,
    mobileCodeConfig,
  ]);
}
