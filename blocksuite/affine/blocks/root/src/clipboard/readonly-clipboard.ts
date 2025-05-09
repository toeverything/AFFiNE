import {
  copyMiddleware,
  defaultImageProxyMiddleware,
  titleMiddleware,
} from '@blocksuite/affine-shared/adapters';
import {
  copySelectedModelsCommand,
  draftSelectedModelsCommand,
  getSelectedModelsCommand,
} from '@blocksuite/affine-shared/commands';
import { DisposableGroup } from '@blocksuite/global/disposable';
import { LifeCycleWatcher, type UIEventHandler } from '@blocksuite/std';

/**
 * ReadOnlyClipboard is a class that provides a read-only clipboard for the root block.
 * It is supported to copy models in the root block.
 */
export class ReadOnlyClipboard extends LifeCycleWatcher {
  static override key = 'affine-readonly-clipboard';

  protected readonly _copySelectedInPage = (onCopy?: () => void) => {
    return this.std.command
      .chain()
      .with({ onCopy })
      .pipe(getSelectedModelsCommand, { types: ['block', 'text', 'image'] })
      .pipe(draftSelectedModelsCommand)
      .pipe(copySelectedModelsCommand);
  };

  protected _disposables = new DisposableGroup();

  protected _initAdapters = () => {
    const copy = copyMiddleware(this.std);
    this.std.clipboard.use(copy);
    this.std.clipboard.use(
      titleMiddleware(this.std.store.workspace.meta.docMetas)
    );
    this.std.clipboard.use(defaultImageProxyMiddleware);

    this._disposables.add({
      dispose: () => {
        this.std.clipboard.unuse(copy);
        this.std.clipboard.unuse(
          titleMiddleware(this.std.store.workspace.meta.docMetas)
        );
        this.std.clipboard.unuse(defaultImageProxyMiddleware);
      },
    });
  };

  onPageCopy: UIEventHandler = ctx => {
    const e = ctx.get('clipboardState').raw;
    e.preventDefault();

    this._copySelectedInPage().run();
  };

  override mounted(): void {
    if (!navigator.clipboard) {
      console.error(
        'navigator.clipboard is not supported in current environment.'
      );
      return;
    }
    if (this._disposables.disposed) {
      this._disposables = new DisposableGroup();
    }
    this.std.event.add('copy', this.onPageCopy);
    this._initAdapters();
  }
}
