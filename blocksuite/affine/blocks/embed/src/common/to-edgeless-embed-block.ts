import { EdgelessLegacySlotIdentifier } from '@blocksuite/affine-block-surface';
import type { EmbedProps } from '@blocksuite/affine-model';
import { Bound } from '@blocksuite/global/gfx';
import {
  blockComponentSymbol,
  type BlockService,
  type GfxBlockComponent,
  GfxElementSymbol,
  toGfxBlockComponent,
} from '@blocksuite/std';
import type { GfxBlockElementModel } from '@blocksuite/std/gfx';
import type { StyleInfo } from 'lit/directives/style-map.js';

import type { EmbedBlockComponent } from './embed-block-element.js';

export function toEdgelessEmbedBlock<
  Model extends GfxBlockElementModel<EmbedProps>,
  Service extends BlockService,
  WidgetName extends string,
  B extends typeof EmbedBlockComponent<Model, Service, WidgetName>,
>(block: B) {
  return class extends toGfxBlockComponent(block) {
    override selectedStyle$ = null;

    override [blockComponentSymbol] = true;

    override blockDraggable = false;

    protected override embedContainerStyle: StyleInfo = {};

    override [GfxElementSymbol] = true;

    get bound(): Bound {
      return Bound.deserialize(this.model.xywh);
    }

    _handleClick(_: MouseEvent): void {
      return;
    }

    get edgelessSlots() {
      return this.std.get(EdgelessLegacySlotIdentifier);
    }

    override connectedCallback(): void {
      super.connectedCallback();

      this._disposables.add(
        this.edgelessSlots.elementResizeStart.subscribe(() => {
          this.isResizing$.value = true;
        })
      );

      this._disposables.add(
        this.edgelessSlots.elementResizeEnd.subscribe(() => {
          this.isResizing$.value = false;
        })
      );
    }

    override renderGfxBlock() {
      const bound = Bound.deserialize(this.model.xywh);

      this.embedContainerStyle.width = `${bound.w}px`;
      this.embedContainerStyle.height = `${bound.h}px`;
      this.blockContainerStyles = {
        width: `${bound.w}px`,
      };

      return this.renderPageContent();
    }

    protected override accessor blockContainerStyles: StyleInfo | undefined =
      undefined;
  } as B & {
    new (...args: any[]): GfxBlockComponent;
  };
}
