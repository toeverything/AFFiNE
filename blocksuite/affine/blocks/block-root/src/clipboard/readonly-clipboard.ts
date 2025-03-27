import { defaultImageProxyMiddleware } from '@blocksuite/affine-block-image';
import {
  AttachmentAdapter,
  ClipboardAdapter,
  copyMiddleware,
  HtmlAdapter,
  ImageAdapter,
  MixTextAdapter,
  NotionTextAdapter,
  titleMiddleware,
} from '@blocksuite/affine-shared/adapters';
import {
  copySelectedModelsCommand,
  draftSelectedModelsCommand,
  getSelectedModelsCommand,
} from '@blocksuite/affine-shared/commands';
import {
  ClipboardAdapterConfigExtension,
  LifeCycleWatcher,
  type UIEventHandler,
} from '@blocksuite/block-std';
import { DisposableGroup } from '@blocksuite/global/disposable';
import type { ExtensionType } from '@blocksuite/store';

const SnapshotClipboardConfig = ClipboardAdapterConfigExtension({
  mimeType: ClipboardAdapter.MIME,
  adapter: ClipboardAdapter,
  priority: 100,
});

const NotionClipboardConfig = ClipboardAdapterConfigExtension({
  mimeType: 'text/_notion-text-production',
  adapter: NotionTextAdapter,
  priority: 95,
});

const HtmlClipboardConfig = ClipboardAdapterConfigExtension({
  mimeType: 'text/html',
  adapter: HtmlAdapter,
  priority: 90,
});

const imageClipboardConfigs = [
  'image/apng',
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
].map(mimeType => {
  return ClipboardAdapterConfigExtension({
    mimeType,
    adapter: ImageAdapter,
    priority: 80,
  });
});

const PlainTextClipboardConfig = ClipboardAdapterConfigExtension({
  mimeType: 'text/plain',
  adapter: MixTextAdapter,
  priority: 70,
});

const AttachmentClipboardConfig = ClipboardAdapterConfigExtension({
  mimeType: '*/*',
  adapter: AttachmentAdapter,
  priority: 60,
});

export const clipboardConfigs: ExtensionType[] = [
  SnapshotClipboardConfig,
  NotionClipboardConfig,
  HtmlClipboardConfig,
  ...imageClipboardConfigs,
  PlainTextClipboardConfig,
  AttachmentClipboardConfig,
];

/**
 * ReadOnlyClipboard is a class that provides a read-only clipboard for the root block.
 * It is supported to copy models in the root block.
 */
export class ReadOnlyClipboard extends LifeCycleWatcher {
  static override key = 'affine-readonly-clipboard';

  protected readonly _copySelected = (onCopy?: () => void) => {
    return this.std.command
      .chain()
      .with({ onCopy })
      .pipe(getSelectedModelsCommand)
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

    this._copySelected().run();
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
