import { PeekViewService } from '@affine/core/modules/peek-view/services/peek-view';
import { AppThemeService } from '@affine/core/modules/theme';
import {
  type BlockStdScope,
  LifeCycleWatcher,
  StdIdentifier,
} from '@blocksuite/affine/block-std';
import type { Container } from '@blocksuite/affine/global/di';
import { ColorScheme } from '@blocksuite/affine/model';
import {
  type ThemeExtension,
  ThemeExtensionIdentifier,
} from '@blocksuite/affine/shared/services';
import {
  createSignalFromObservable,
  type Signal,
  SpecProvider,
} from '@blocksuite/affine/shared/utils';
import type { ExtensionType } from '@blocksuite/affine/store';
import type { FrameworkProvider } from '@toeverything/infra';
import type { Observable } from 'rxjs';

import { AIChatBlockSpec } from '../../ai/blocks';
import { AITranscriptionBlockSpec } from '../../ai/blocks/ai-chat-block/ai-transcription-block';
import { buildDocDisplayMetaExtension } from '../display-meta';
import { getFontConfigExtension } from '../font-config';
import { patchPeekViewService } from '../peek-view-service';
import { getThemeExtension } from '../theme';

function getPagePreviewThemeExtension(framework: FrameworkProvider) {
  class AffinePagePreviewThemeExtension
    extends LifeCycleWatcher
    implements ThemeExtension
  {
    static override readonly key = 'affine-page-preview-theme';

    readonly theme: Signal<ColorScheme>;

    readonly disposables: (() => void)[] = [];

    static override setup(di: Container) {
      super.setup(di);
      di.override(ThemeExtensionIdentifier, AffinePagePreviewThemeExtension, [
        StdIdentifier,
      ]);
    }

    constructor(std: BlockStdScope) {
      super(std);
      const theme$: Observable<ColorScheme> = framework
        .get(AppThemeService)
        .appTheme.theme$.map(theme => {
          return theme === ColorScheme.Dark
            ? ColorScheme.Dark
            : ColorScheme.Light;
        });
      const { signal, cleanup } = createSignalFromObservable<ColorScheme>(
        theme$,
        ColorScheme.Light
      );
      this.theme = signal;
      this.disposables.push(cleanup);
    }

    getAppTheme() {
      return this.theme;
    }

    getEdgelessTheme() {
      return this.theme;
    }

    override unmounted() {
      this.dispose();
    }

    dispose() {
      this.disposables.forEach(dispose => dispose());
    }
  }

  return AffinePagePreviewThemeExtension;
}

const fontConfig = getFontConfigExtension();

let _framework: FrameworkProvider;
let _previewExtensions: ExtensionType[];
export function enablePreviewExtension(framework: FrameworkProvider): void {
  if (_framework === framework && _previewExtensions) {
    return;
  }

  const specProvider = SpecProvider._;

  if (_previewExtensions) {
    _previewExtensions.forEach(extension => {
      specProvider.omitSpec('preview:page', extension);
      specProvider.omitSpec('preview:edgeless', extension);
    });
  }

  _framework = framework;
  const peekViewService = framework.get(PeekViewService);

  _previewExtensions = [
    ...AIChatBlockSpec,
    ...AITranscriptionBlockSpec,
    fontConfig,
    getThemeExtension(framework),
    getPagePreviewThemeExtension(framework),
    buildDocDisplayMetaExtension(framework),
    patchPeekViewService(peekViewService),
  ];

  specProvider.extendSpec('preview:page', _previewExtensions);
  specProvider.extendSpec('preview:edgeless', _previewExtensions);
}
