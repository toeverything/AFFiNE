import { AppThemeService } from '@affine/core/modules/theme';
import { ColorScheme } from '@blocksuite/affine/model';
import {
  type ThemeExtension,
  ThemeExtensionIdentifier,
} from '@blocksuite/affine/shared/services';
import {
  createSignalFromObservable,
  type Signal,
} from '@blocksuite/affine/shared/utils';
import {
  type BlockStdScope,
  LifeCycleWatcher,
  StdIdentifier,
} from '@blocksuite/affine/std';
import type { Container } from '@blocksuite/global/di';
import type { FrameworkProvider } from '@toeverything/infra';
import type { Observable } from 'rxjs';

export function getPreviewThemeExtension(framework: FrameworkProvider) {
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
