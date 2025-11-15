import { EmbedSyncedDocBlockSchema } from '@blocksuite/affine-model';
import { DisposableGroup } from '@blocksuite/global/disposable';
import { LifeCycleWatcher } from '@blocksuite/std';

import { EmbedEdgelessSyncedDocBlockComponent } from './embed-edgeless-synced-doc-block';
import { calcSyncedDocFullHeight } from './utils';

export class HeightInitializationExtension extends LifeCycleWatcher {
  static override key = 'embed-synced-doc-block-height-initialization';

  override mounted() {
    super.mounted();

    this._disposables.add(
      this.std.store.slots.blockUpdated.subscribe(payload => {
        if (
          payload.type === 'add' &&
          payload.isLocal &&
          payload.flavour === EmbedSyncedDocBlockSchema.model.flavour &&
          payload.model.parent?.flavour === 'affine:surface'
        ) {
          this._initQueue.add(payload.id);
        }
      })
    );

    this._disposables.add(
      this.std.view.viewUpdated.subscribe(payload => {
        if (
          payload.type === 'block' &&
          payload.method === 'add' &&
          this._initQueue.has(payload.id)
        ) {
          this._initQueue.delete(payload.id);
          if (!(payload.view instanceof EmbedEdgelessSyncedDocBlockComponent)) {
            return;
          }
          const block = payload.view;

          block.updateComplete
            .then(() => {
              if (!block.contentElement) return;
              const resizeObserver = new ResizeObserver(() => {
                const { x, y, w } = block.model.elementBound;
                const h = calcSyncedDocFullHeight(block);
                block.model.xywh$.value = `[${x},${y},${w},${h}]`;

                resizeObserver.disconnect();
              });
              resizeObserver.observe(block.contentElement);
            })
            .catch(console.error);
        }
      })
    );
  }

  override unmounted(): void {
    this._disposables.dispose();
  }

  private readonly _initQueue = new Set<string>();

  private readonly _disposables = new DisposableGroup();
}
