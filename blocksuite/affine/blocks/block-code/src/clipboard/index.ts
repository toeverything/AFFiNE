import { deleteTextCommand } from '@blocksuite/affine-inline-preset';
import {
  HtmlAdapter,
  pasteMiddleware,
  PlainTextAdapter,
} from '@blocksuite/affine-shared/adapters';
import {
  getBlockIndexCommand,
  getBlockSelectionsCommand,
  getTextSelectionCommand,
} from '@blocksuite/affine-shared/commands';
import {
  type BlockComponent,
  Clipboard,
  type UIEventHandler,
} from '@blocksuite/block-std';
import { DisposableGroup } from '@blocksuite/global/disposable';

export class CodeClipboardController {
  private _clipboard!: Clipboard;

  protected _disposables = new DisposableGroup();

  protected _init = () => {
    this._clipboard.registerAdapter('text/plain', PlainTextAdapter, 90);
    this._clipboard.registerAdapter('text/html', HtmlAdapter, 80);
    const paste = pasteMiddleware(this._std);
    this._clipboard.use(paste);

    this._disposables.add({
      dispose: () => {
        this._clipboard.unregisterAdapter('text/plain');
        this._clipboard.unregisterAdapter('text/html');
        this._clipboard.unuse(paste);
      },
    });
  };

  host: BlockComponent;

  onPagePaste: UIEventHandler = ctx => {
    const e = ctx.get('clipboardState').raw;
    e.preventDefault();

    this._std.store.captureSync();
    this._std.command
      .chain()
      .try(cmd => [
        cmd.pipe(getTextSelectionCommand).pipe((ctx, next) => {
          const textSelection = ctx.currentTextSelection;
          if (!textSelection) return;
          const end = textSelection.to ?? textSelection.from;
          next({ currentSelectionPath: end.blockId });
        }),
        cmd.pipe(getBlockSelectionsCommand).pipe((ctx, next) => {
          const currentBlockSelections = ctx.currentBlockSelections;
          if (!currentBlockSelections) return;
          const blockSelection = currentBlockSelections.at(-1);
          if (!blockSelection) return;
          next({ currentSelectionPath: blockSelection.blockId });
        }),
      ])
      .pipe(getBlockIndexCommand)
      .try(cmd => [cmd.pipe(getTextSelectionCommand).pipe(deleteTextCommand)])
      .pipe((ctx, next) => {
        if (!ctx.parentBlock) {
          return;
        }
        this._clipboard
          .paste(
            e,
            this._std.store,
            ctx.parentBlock.model.id,
            ctx.blockIndex ? ctx.blockIndex + 1 : 1
          )
          .catch(console.error);

        return next();
      })
      .run();
    return true;
  };

  private get _std() {
    return this.host.std;
  }

  constructor(host: BlockComponent) {
    this.host = host;
  }

  hostConnected() {
    if (this._disposables.disposed) {
      this._disposables = new DisposableGroup();
    }
    if (navigator.clipboard) {
      this._clipboard = new Clipboard(this._std);
      this.host.handleEvent('paste', this.onPagePaste);
      this._init();
    }
  }

  hostDisconnected() {
    this._disposables.dispose();
  }
}
