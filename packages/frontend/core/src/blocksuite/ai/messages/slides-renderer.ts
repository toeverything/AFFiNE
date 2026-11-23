import { WorkspaceImpl } from '@affine/core/modules/workspace/impls/workspace';
import { ViewExtensionManagerIdentifier } from '@blocksuite/affine/ext-loader';
import { WithDisposable } from '@blocksuite/affine/global/lit';
import { BlockStdScope, type EditorHost } from '@blocksuite/affine/std';
import type { Store } from '@blocksuite/affine/store';
import { css, html, LitElement, nothing } from 'lit';
import { property, query } from 'lit/decorators.js';
import { createRef, type Ref, ref } from 'lit/directives/ref.js';
import { Doc as YDoc } from 'yjs';

import { PPTBuilder } from '../slides/index';
import { getAIPanelWidget } from '../utils/ai-widgets';
import type { AIContext } from '../utils/context';
import type { AffineAIPanelWidgetConfig } from '../widgets/ai-panel/type';

export const createSlidesRenderer: (
  host: EditorHost,
  ctx: AIContext
) => AffineAIPanelWidgetConfig['answerRenderer'] = (host, ctx) => {
  return (answer, state) => {
    if (state === 'generating') {
      const panel = getAIPanelWidget(host);
      panel.generatingElement?.updateLoadingProgress(2);
      return nothing;
    }

    if (state !== 'finished' && state !== 'error') {
      return nothing;
    }

    return html`<style>
        .slides-container {
          width: 100%;
          height: 300px;
        }
      </style>
      <div class="slides-container">
        <ai-slides-renderer
          .host=${host}
          .ctx=${ctx}
          .text=${answer}
        ></ai-slides-renderer>
      </div>`;
  };
};

export class AISlidesRenderer extends WithDisposable(LitElement) {
  static override styles = css``;

  private readonly _editorContainer: Ref<HTMLDivElement> =
    createRef<HTMLDivElement>();

  private _doc!: Store;

  private _docCollection: WorkspaceImpl | null = null;

  @query('editor-host')
  private accessor _editorHost!: EditorHost;

  @property({ attribute: false })
  accessor text!: string;

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor ctx:
    | {
        get(): Record<string, unknown>;
        set(data: Record<string, unknown>): void;
      }
    | undefined = undefined;

  protected override firstUpdated() {
    requestAnimationFrame(() => {
      if (!this._editorHost) return;
      PPTBuilder(this._editorHost)
        ?.process(this.text)
        .then(res => {
          if (res && this.ctx) {
            this.ctx.set({
              contents: res.contents,
              images: res.images,
            });
            // refresh loading menu item
            getAIPanelWidget(this.host)
              .shadowRoot?.querySelector('ai-panel-answer')
              ?.requestUpdate();
          }
        })
        .catch(console.error);
    });
  }

  protected _getExtensions() {
    return this.host.std
      .get(ViewExtensionManagerIdentifier)
      .get('preview-edgeless');
  }

  protected override render() {
    return html`<style>
        .slides-container {
          position: relative;
          width: 100%;
          height: 100%;
        }

        .edgeless-container {
          width: 100%;
          height: 100%;
          border-radius: 4px;
          border: 1px solid var(--affine-border-color);
        }

        .mask {
          position: absolute;
          top: 0;
          left: 0;
          z-index: 1;
          background-color: transparent;
          width: 100%;
          height: 100%;
        }

        .edgeless-container affine-edgeless-zoom-toolbar-widget,
        edgeless-toolbar {
          display: none;
        }

        * {
          box-sizing: border-box;
        }

        .affine-edgeless-viewport {
          display: block;
          height: 100%;
          position: relative;
          overflow: hidden;
          container-name: viewport;
          container-type: inline-size;
        }

        .affine-edgeless-surface-block-container {
          position: absolute;
          width: 100%;
          height: 100%;
        }

        .affine-edgeless-surface-block-container canvas {
          width: 100%;
          height: 100%;
          position: relative;
          z-index: 1;
          pointer-events: none;
        }

        edgeless-block-portal-container {
          position: relative;
          box-sizing: border-box;
          overflow: hidden;
          display: block;
          height: 100%;
          font-family: var(--affine-font-family);
          font-size: var(--affine-font-base);
          line-height: var(--affine-line-height);
          color: var(--affine-text-primary-color);
          font-weight: 400;
        }

        .affine-block-children-container.edgeless {
          padding-left: 0;
          position: relative;
          overflow: hidden;
          height: 100%;
          touch-action: none;
          background-color: var(--affine-background-primary-color);
          background-image: radial-gradient(
            var(--affine-edgeless-grid-color) 1px,
            var(--affine-background-primary-color) 1px
          );
          z-index: 0;
        }

        .affine-edgeless-block-child {
          position: absolute;
          transform-origin: center;
          box-sizing: border-box;
          border: 2px solid var(--affine-white-10);
          border-radius: 8px;
          box-shadow: var(--affine-shadow-3);
          pointer-events: all;
        }

        affine-edgeless-image .resizable-img,
        affine-edgeless-image .resizable-img img {
          width: 100%;
          height: 100%;
        }

        .affine-edgeless-layer {
          position: absolute;
          top: 0;
          left: 0;
          contain: size layout style;
        }
      </style>
      <div class="slides-container">
        <div
          class="edgeless-container affine-edgeless-viewport"
          ${ref(this._editorContainer)}
        >
          ${new BlockStdScope({
            store: this._doc,
            extensions: this._getExtensions(),
          }).render()}
        </div>
        <div class="mask"></div>
      </div>`;
  }

  override connectedCallback(): void {
    super.connectedCallback();

    const collection = new WorkspaceImpl({
      id: 'SLIDES_PREVIEW',
      rootDoc: new YDoc({ guid: 'SLIDES_PREVIEW' }),
    });
    collection.meta.initialize();
    const doc = collection.createDoc().getStore();

    doc.load(() => {
      const pageBlockId = doc.addBlock('affine:page', {});
      doc.addBlock('affine:surface', {}, pageBlockId);
    });

    doc.resetHistory();
    this._doc = doc;
    this._docCollection = collection;
  }

  override disconnectedCallback(): void {
    this._docCollection?.dispose();
    super.disconnectedCallback();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-slides-renderer': AISlidesRenderer;
  }
}
