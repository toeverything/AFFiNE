import {
  EmbedSyncedDocBlockSchema,
  SYNCED_DEFAULT_MAX_HEIGHT,
  SYNCED_MIN_HEIGHT,
} from '@blocksuite/affine-model';
import { DisposableGroup } from '@blocksuite/global/disposable';
import { clamp } from '@blocksuite/global/gfx';
import { LifeCycleWatcher } from '@blocksuite/std';

import { EmbedEdgelessSyncedDocBlockComponent } from './embed-edgeless-synced-doc-block';

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

          block.contentElement
            .then(contentEl => {
              if (!contentEl) return;

              const resizeObserver = new ResizeObserver(() => {
                const headerHeight =
                  block.headerWrapper?.getBoundingClientRect().height ?? 0;
                const contentHeight = contentEl.getBoundingClientRect().height;

                const { x, y, w } = block.model.elementBound;
                const h = clamp(
                  (headerHeight + contentHeight) / block.gfx.viewport.zoom,
                  SYNCED_MIN_HEIGHT,
                  SYNCED_DEFAULT_MAX_HEIGHT
                );
                block.model.xywh$.value = `[${x},${y},${w},${h}]`;

                resizeObserver.unobserve(contentEl);
              });
              resizeObserver.observe(contentEl);
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
