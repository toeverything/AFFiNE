import { NoteDisplayMode } from '@blocksuite/affine-model';
import { DocModeProvider } from '@blocksuite/affine-shared/services';
import { scrollbarStyle } from '@blocksuite/affine-shared/styles';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { TocIcon } from '@blocksuite/icons/lit';
import {
  type EditorHost,
  PropTypes,
  requiredProperties,
  ShadowlessElement,
} from '@blocksuite/std';
import { provide } from '@lit/context';
import { signal } from '@preact/signals-core';
import { css, html, nothing, type PropertyValues } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';

import { type TocContext, tocContext } from './config.js';
import { getHeadingBlocksFromDoc } from './utils/query.js';
import {
  observeActiveHeadingDuringScroll,
  scrollToBlockWithHighlight,
} from './utils/scroll.js';

export const AFFINE_OUTLINE_VIEWER = 'affine-outline-viewer';

@requiredProperties({
  editor: PropTypes.object,
})
export class OutlineViewer extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    affine-outline-viewer {
      display: flex;
    }
    .outline-viewer-root {
      --duration: 120ms;
      --timing: cubic-bezier(0.42, 0, 0.58, 1);

      max-height: 100%;
      box-sizing: border-box;
      display: flex;
    }

    .outline-viewer-indicators-container {
      position: absolute;
      top: 0;
      right: 0;
      max-height: 100%;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      overflow-y: hidden;
    }

    .outline-viewer-indicator-wrapper {
      flex: 1 1 16px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .outline-viewer-indicator {
      width: 20px;
      height: 2px;
      border-radius: 1px;
      overflow: hidden;
      background: var(--affine-black-10, rgba(0, 0, 0, 0.1));
    }

    .outline-viewer-indicator.active {
      width: 24px;
      background: var(--affine-text-primary-color);
    }

    .outline-viewer-panel {
      position: relative;
      display: flex;
      width: 0px;
      max-height: 100%;
      box-sizing: border-box;
      flex-direction: column;
      align-items: flex-start;

      border-radius: 8px;
      border-width: 0px;
      border-style: solid;
      border-color: var(--affine-border-color);
      background: var(--affine-background-overlay-panel-color);
      box-shadow: 0px 6px 16px 0px rgba(0, 0, 0, 0.14);

      overflow-y: auto;

      opacity: 0;
      transform: translateX(0px);
      transition:
        width 0s var(--duration),
        padding 0s var(--duration),
        border-width 0s var(--duration),
        transform var(--duration) var(--timing),
        opacity var(--duration) var(--timing);
    }

    ${scrollbarStyle('.outline-viewer-panel')}

    .outline-viewer-header {
      display: flex;
      padding: 6px;
      align-items: center;
      gap: 4px;
      align-self: stretch;

      span {
        flex: 1;
        overflow: hidden;
        color: var(--affine-text-secondary-color);
        text-overflow: ellipsis;

        font-family: var(--affine-font-family);
        font-size: 12px;
        font-style: normal;
        font-weight: 500;
        line-height: 20px;
      }
    }

    .outline-viewer-item {
      width: 100%;
    }

    .outline-viewer-root:hover {
      .outline-viewer-indicators-container {
        visibility: hidden;
      }

      .outline-viewer-panel {
        width: 200px;
        border-width: 1px;
        padding: 8px 4px 8px 8px;
        opacity: 1;
        transform: translateX(-10px);
        transition:
          transform var(--duration) var(--timing),
          opacity var(--duration) var(--timing);
      }
    }
  `;

  private readonly _activeHeadingId$ = signal<string | null>(null);

  private _highlightMaskDisposable = () => {};

  private _lockActiveHeadingId = false;

  private readonly _scrollPanel = () => {
    this._activeItem?.scrollIntoView({
      behavior: 'instant',
      block: 'center',
    });
  };

  private async _scrollToBlock(blockId: string) {
    this._lockActiveHeadingId = true;
    this._activeHeadingId$.value = blockId;
    this._highlightMaskDisposable = await scrollToBlockWithHighlight(
      this.editor,
      blockId
    );
    this._lockActiveHeadingId = false;
  }

  private _toggleOutlinePanel() {
    if (this.toggleOutlinePanel) {
      this._showViewer = false;
      this.toggleOutlinePanel();
    }
  }

  private _setContext() {
    this._context = {
      editor$: signal(this.editor),
      showIcons$: signal<boolean>(false),
      enableSorting$: signal<boolean>(false),
      fitPadding$: signal<number[]>([]),
    };
  }

  override connectedCallback() {
    super.connectedCallback();

    this.disposables.add(
      observeActiveHeadingDuringScroll(
        () => this.editor,
        newHeadingId => {
          if (this._lockActiveHeadingId) return;
          this._activeHeadingId$.value = newHeadingId;
        }
      )
    );

    // title update
    this.disposables.add(
      this.editor.store.workspace.meta.docMetaUpdated.subscribe(() => {
        this.requestUpdate();
      })
    );

    this._setContext();
  }

  override willUpdate(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has('editor')) {
      this._context.editor$.value = this.editor;
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._highlightMaskDisposable();
  }

  override render() {
    const docModeService = this.editor.std.get(DocModeProvider);
    const mode = docModeService.getEditorMode();
    if (this.editor.store.root === null || mode === 'edgeless') return nothing;

    const headingBlocks = getHeadingBlocksFromDoc(
      this.editor.store,
      [NoteDisplayMode.DocAndEdgeless, NoteDisplayMode.DocOnly],
      true
    );

    if (headingBlocks.length === 0) return nothing;

    const items = [
      ...(this.editor.store.meta?.title !== '' ? [this.editor.store.root] : []),
      ...headingBlocks,
    ];

    const toggleOutlinePanelButton =
      this.toggleOutlinePanel !== null
        ? html`<edgeless-tool-icon-button
            .tooltip=${'Open in sidebar'}
            .tipPosition=${'top-end'}
            .activeMode=${'background'}
            @click=${this._toggleOutlinePanel}
            data-testid="toggle-outline-panel-button"
          >
            ${TocIcon({ width: '1em', height: '1em' })}
          </edgeless-tool-icon-button>`
        : nothing;

    return html`
      <div class="outline-viewer-root" @mouseenter=${this._scrollPanel}>
        <div class="outline-viewer-indicators-container">
          ${repeat(
            items,
            block => block.id,
            block =>
              html`<div class="outline-viewer-indicator-wrapper">
                <div
                  class=${classMap({
                    'outline-viewer-indicator': true,
                    active: this._activeHeadingId$.value === block.id,
                  })}
                ></div>
              </div>`
          )}
        </div>
        <div class="outline-viewer-panel">
          <div class="outline-viewer-item outline-viewer-header">
            <span>Table of Contents</span>
            ${toggleOutlinePanelButton}
          </div>
          ${repeat(
            items,
            block => block.id,
            block => {
              return html`<div
                class=${classMap({
                  'outline-viewer-item': true,
                  active: this._activeHeadingId$.value === block.id,
                })}
              >
                <affine-outline-block-preview
                  class=${classMap({
                    active: this._activeHeadingId$.value === block.id,
                  })}
                  .block=${block}
                  @click=${() => {
                    this._scrollToBlock(block.id).catch(console.error);
                  }}
                >
                </affine-outline-block-preview>
              </div>`;
            }
          )}
        </div>
      </div>
    `;
  }

  @provide({ context: tocContext })
  private accessor _context!: TocContext;

  @query('.outline-viewer-item.active')
  private accessor _activeItem: HTMLElement | null = null;

  @state()
  private accessor _showViewer: boolean = false;

  @property({ attribute: false })
  accessor editor!: EditorHost;

  @property({ attribute: false })
  accessor toggleOutlinePanel: (() => void) | null = null;
}

declare global {
  interface HTMLElementTagNameMap {
    [AFFINE_OUTLINE_VIEWER]: OutlineViewer;
  }
}
