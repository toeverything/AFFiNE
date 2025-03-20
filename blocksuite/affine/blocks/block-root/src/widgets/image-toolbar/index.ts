import type { ImageBlockComponent } from '@blocksuite/affine-block-image';
import { HoverController } from '@blocksuite/affine-components/hover';
import type {
  AdvancedMenuItem,
  MenuItemGroup,
} from '@blocksuite/affine-components/toolbar';
import {
  cloneGroups,
  getMoreMenuConfig,
} from '@blocksuite/affine-components/toolbar';
import type { ImageBlockModel } from '@blocksuite/affine-model';
import { PAGE_HEADER_HEIGHT } from '@blocksuite/affine-shared/consts';
import {
  BlockSelection,
  TextSelection,
  WidgetComponent,
} from '@blocksuite/block-std';
import { limitShift, shift } from '@floating-ui/dom';
import { html } from 'lit';

import { MORE_GROUPS, PRIMARY_GROUPS } from './config.js';
import { ImageToolbarContext } from './context.js';

export const AFFINE_IMAGE_TOOLBAR_WIDGET = 'affine-image-toolbar-widget';

export class AffineImageToolbarWidget extends WidgetComponent<
  ImageBlockModel,
  ImageBlockComponent
> {
  private _hoverController: HoverController | null = null;

  private _isActivated = false;

  private readonly _setHoverController = () => {
    this._hoverController = null;
    this._hoverController = new HoverController(
      this,
      ({ abortController }) => {
        const imageBlock = this.block;
        if (!imageBlock) {
          return null;
        }
        const selection = this.host.selection;

        const textSelection = selection.find(TextSelection);
        if (
          !!textSelection &&
          (!!textSelection.to || !!textSelection.from.length)
        ) {
          return null;
        }

        const blockSelections = selection.filter(BlockSelection);
        if (
          blockSelections.length > 1 ||
          (blockSelections.length === 1 &&
            blockSelections[0].blockId !== imageBlock.blockId)
        ) {
          return null;
        }

        const imageContainer =
          imageBlock.resizableImg ?? imageBlock.fallbackCard;
        if (!imageContainer) {
          return null;
        }

        const context = new ImageToolbarContext(imageBlock, abortController);

        return {
          template: html`<affine-image-toolbar
            .context=${context}
            .primaryGroups=${this.primaryGroups}
            .moreGroups=${this.moreGroups}
            .onActiveStatusChange=${(active: boolean) => {
              this._isActivated = active;
              if (!active && !this._hoverController?.isHovering) {
                this._hoverController?.abort();
              }
            }}
          ></affine-image-toolbar>`,
          container: this.block,
          // stacking-context(editor-host)
          portalStyles: {
            zIndex: 'var(--affine-z-index-popover)',
          },
          computePosition: {
            referenceElement: imageContainer,
            placement: 'right-start',
            middleware: [
              shift({
                crossAxis: true,
                padding: {
                  top: PAGE_HEADER_HEIGHT + 12,
                  bottom: 12,
                  right: 12,
                },
                limiter: limitShift(),
              }),
            ],
            autoUpdate: true,
          },
        };
      },
      { allowMultiple: true }
    );

    const imageBlock = this.block;
    if (!imageBlock) {
      return;
    }
    this._hoverController.setReference(imageBlock);
    this._hoverController.onAbort = () => {
      // If the more menu is opened, don't close it.
      if (this._isActivated) return;
      this._hoverController?.abort();
      return;
    };
  };

  addMoreItems = (
    items: AdvancedMenuItem<ImageToolbarContext>[],
    index?: number,
    type?: string
  ) => {
    let group;
    if (type) {
      group = this.moreGroups.find(g => g.type === type);
    }
    if (!group) {
      group = this.moreGroups[0];
    }

    if (index === undefined) {
      group.items.push(...items);
      return this;
    }

    group.items.splice(index, 0, ...items);
    return this;
  };

  addPrimaryItems = (
    items: AdvancedMenuItem<ImageToolbarContext>[],
    index?: number
  ) => {
    if (index === undefined) {
      this.primaryGroups[0].items.push(...items);
      return this;
    }

    this.primaryGroups[0].items.splice(index, 0, ...items);
    return this;
  };

  /*
   * Caches the more menu items.
   * Currently only supports configuring more menu.
   */
  moreGroups: MenuItemGroup<ImageToolbarContext>[] = cloneGroups(MORE_GROUPS);

  primaryGroups: MenuItemGroup<ImageToolbarContext>[] =
    cloneGroups(PRIMARY_GROUPS);

  override firstUpdated() {
    if (this.doc.getParent(this.model.id)?.flavour === 'affine:surface') {
      return;
    }

    this.moreGroups = getMoreMenuConfig(this.std).configure(this.moreGroups);
    this._setHoverController();
  }
}
