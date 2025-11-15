import {
  AttachmentBlockModel,
  BookmarkBlockModel,
  CodeBlockModel,
  DatabaseBlockModel,
  ImageBlockModel,
  SurfaceRefBlockModel,
} from '@blocksuite/affine-model';
import { getSelectionRectsCommand } from '@blocksuite/affine-shared/commands';
import { EMBED_BLOCK_MODEL_LIST } from '@blocksuite/affine-shared/consts';
import { matchModels } from '@blocksuite/affine-shared/utils';
import {
  BlockSelection,
  TextSelection,
  WidgetComponent,
} from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import type { BaseSelection, UserInfo } from '@blocksuite/store';
import { computed, effect } from '@preact/signals-core';
import { css, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import throttle from 'lodash-es/throttle';

import { RemoteColorManager } from '../manager/remote-color-manager';
import type { DocRemoteSelectionConfig } from './config';
import { cursorStyle, selectionStyle } from './utils';

export interface SelectionRect {
  width: number;
  height: number;
  top: number;
  left: number;
  transparent?: boolean;
}

export const AFFINE_DOC_REMOTE_SELECTION_WIDGET =
  'affine-doc-remote-selection-widget';

export class AffineDocRemoteSelectionWidget extends WidgetComponent {
  // avoid being unable to select text by mouse click or drag
  static override styles = css`
    :host {
      pointer-events: none;
    }
  `;

  @state()
  private accessor _selections: Array<{
    id: number;
    selections: BaseSelection[];
    rects: SelectionRect[];
    user?: UserInfo;
  }> = [];

  private readonly _abortController = new AbortController();

  private _remoteColorManager: RemoteColorManager | null = null;

  private readonly _remoteSelections = computed(() => {
    const status = this.store.awarenessStore.getStates();
    return [...this.std.selection.remoteSelections.entries()].map(
      ([id, selections]) => {
        return {
          id,
          selections,
          user: status.get(id)?.user,
        };
      }
    );
  });

  private readonly _resizeObserver: ResizeObserver = new ResizeObserver(() => {
    this.requestUpdate();
  });

  private get _config(): DocRemoteSelectionConfig {
    return {
      blockSelectionBackgroundTransparent: block => {
        return matchModels(block, [
          CodeBlockModel,
          DatabaseBlockModel,
          ImageBlockModel,
          AttachmentBlockModel,
          BookmarkBlockModel,
          SurfaceRefBlockModel,
          ...EMBED_BLOCK_MODEL_LIST,
        ]);
      },
    };
  }

  private get _container() {
    return this.offsetParent;
  }

  private get _containerRect() {
    return this.offsetParent?.getBoundingClientRect();
  }

  private get _selectionManager() {
    return this.host.selection;
  }

  private _getTextRange(textSelection: TextSelection): Range | null {
    const toBlockId = textSelection.to
      ? textSelection.to.blockId
      : textSelection.from.blockId;

    let range = this.std.range.textSelectionToRange(
      this._selectionManager.create(TextSelection, {
        from: {
          blockId: toBlockId,
          index: textSelection.to
            ? textSelection.to.index + textSelection.to.length
            : textSelection.from.index + textSelection.from.length,
          length: 0,
        },
        to: null,
      })
    );

    if (!range) {
      // If no range, maybe the block is not updated yet
      // We just set the range to the end of the block
      const block = this.std.view.getBlock(toBlockId);
      if (!block) return null;

      range = this.std.range.textSelectionToRange(
        this._selectionManager.create(TextSelection, {
          from: {
            blockId: toBlockId,
            index: block.model.text?.length ?? 0,
            length: 0,
          },
          to: null,
        })
      );

      if (!range) return null;
    }

    return range;
  }

  private _getCursorRect(selections: BaseSelection[]): SelectionRect | null {
    if (!this.block) {
      return null;
    }

    if (this.block.model.flavour !== 'affine:page') {
      console.error('remote selection widget must be used in page component');
      return null;
    }

    const textSelection = selections.find(
      selection => selection instanceof TextSelection
    ) as TextSelection | undefined;
    const blockSelections = selections.filter(
      selection => selection instanceof BlockSelection
    );
    const container = this._container;
    const containerRect = this._containerRect;

    if (textSelection) {
      const range = this._getTextRange(textSelection);
      if (!range) return null;

      const container = this._container;
      const containerRect = this._containerRect;
      const rangeRects = Array.from(range.getClientRects());
      if (rangeRects.length > 0) {
        const rect =
          rangeRects.length === 1
            ? rangeRects[0]
            : rangeRects[rangeRects.length - 1];
        return {
          width: 2,
          height: rect.height,
          top:
            rect.top - (containerRect?.top ?? 0) + (container?.scrollTop ?? 0),
          left:
            rect.left -
            (containerRect?.left ?? 0) +
            (container?.scrollLeft ?? 0),
        };
      }
    } else if (blockSelections.length > 0) {
      const lastBlockSelection = blockSelections[blockSelections.length - 1];

      const block = this.host.view.getBlock(lastBlockSelection.blockId);
      if (block) {
        const rect = block.getBoundingClientRect();

        return {
          width: 2,
          height: rect.height,
          top:
            rect.top - (containerRect?.top ?? 0) + (container?.scrollTop ?? 0),
          left:
            rect.left +
            rect.width -
            (containerRect?.left ?? 0) +
            (container?.scrollLeft ?? 0),
        };
      }
    }

    return null;
  }

  private readonly _getSelectionRect = (
    selections: BaseSelection[]
  ): SelectionRect[] => {
    if (!this.block) {
      return [];
    }

    if (this.block.model.flavour !== 'affine:page') {
      console.error('remote selection widget must be used in page component');
      return [];
    }

    const textSelection = selections.find(
      selection => selection instanceof TextSelection
    ) as TextSelection | undefined;
    const blockSelections = selections.filter(
      selection => selection instanceof BlockSelection
    );

    if (!textSelection && !blockSelections.length) return [];

    const [_, { selectionRects }] = this.std.command.exec(
      getSelectionRectsCommand,
      {
        textSelection,
        blockSelections,
      }
    );

    if (!selectionRects) return [];

    return selectionRects.map(({ blockId, ...rect }) => {
      if (!blockId) return rect;

      const block = this.host.view.getBlock(blockId);
      if (!block) return rect;

      const isTransparent = this._config.blockSelectionBackgroundTransparent(
        block.model
      );

      return {
        ...rect,
        transparent: isTransparent,
      };
    });
  };

  override connectedCallback() {
    super.connectedCallback();

    this.handleEvent('wheel', () => {
      this.requestUpdate();
    });

    this.disposables.addFromEvent(window, 'resize', () => {
      this.requestUpdate();
    });

    this._remoteColorManager = new RemoteColorManager(this.std);

    this.disposables.add(
      effect(() => {
        const selections = this._remoteSelections.value;
        this._updateSelectionsThrottled(selections);
      })
    );
    this.disposables.add(
      this.std.store.slots.blockUpdated.subscribe(() => {
        this._updateSelectionsThrottled(this._remoteSelections.peek());
      })
    );
    const gfx = this.std.get(GfxControllerIdentifier);
    this.disposables.add(
      gfx.viewport.viewportUpdated.subscribe(() => {
        const selections = this._remoteSelections.peek();
        this._updateSelections(selections);
      })
    );
    this.disposables.add(
      this.std.event.active$.subscribe(value => {
        if (!value) {
          this.std.selection.clearRemote();
        }
      })
    );
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._resizeObserver.disconnect();
    this._abortController.abort();
  }

  private readonly _updateSelections = (
    selections: typeof this._remoteSelections.value
  ) => {
    const remoteUsers = new Set<number>();
    this._selections = selections.flatMap(({ selections, id, user }) => {
      if (remoteUsers.has(id)) {
        return [];
      } else {
        remoteUsers.add(id);
      }

      return {
        id,
        selections,
        rects: this._getSelectionRect(selections),
        user,
      };
    });
  };

  private readonly _updateSelectionsThrottled = throttle(
    this._updateSelections,
    60
  );

  override render() {
    if (this._selections.length === 0) {
      return nothing;
    }

    const remoteColorManager = this._remoteColorManager;
    if (!remoteColorManager) return nothing;
    return html`<div>
      ${this._selections.map(selection => {
        const color = remoteColorManager.get(selection.id);
        if (!color) return [];
        const cursorRect = this._getCursorRect(selection.selections);

        return selection.rects
          .map(r => html`<div style="${selectionStyle(r, color)}"></div>`)
          .concat([
            html`
              <div
                style="${cursorRect
                  ? cursorStyle(cursorRect, color)
                  : styleMap({
                      display: 'none',
                    })}"
              >
                <div
                  style="${styleMap({
                    position: 'relative',
                    height: '100%',
                  })}"
                >
                  <div
                    style="${styleMap({
                      position: 'absolute',
                      left: '-4px',
                      bottom: `${
                        cursorRect?.height ? cursorRect.height - 4 : 0
                      }px`,
                      backgroundColor: color,
                      color: 'white',
                      maxWidth: '160px',
                      padding: '0 3px',
                      border: '1px solid var(--affine-pure-black-20)',
                      boxShadow: '0px 1px 6px 0px rgba(0, 0, 0, 0.16)',
                      borderRadius: '4px',
                      fontSize: '12px',
                      lineHeight: '18px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: selection.user ? 'block' : 'none',
                    })}"
                  >
                    ${selection.user?.name}
                  </div>
                </div>
              </div>
            `,
          ]);
      })}
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    [AFFINE_DOC_REMOTE_SELECTION_WIDGET]: AffineDocRemoteSelectionWidget;
  }
}
