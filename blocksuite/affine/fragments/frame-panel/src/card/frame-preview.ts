import { ViewExtensionManagerIdentifier } from '@blocksuite/affine-ext-loader';
import type { FrameBlockModel } from '@blocksuite/affine-model';
import {
  DocModeExtension,
  DocModeProvider,
  ViewportElementExtension,
} from '@blocksuite/affine-shared/services';
import { DisposableGroup } from '@blocksuite/global/disposable';
import { Bound, deserializeXYWH } from '@blocksuite/global/gfx';
import { WithDisposable } from '@blocksuite/global/lit';
import {
  BlockStdScope,
  type EditorHost,
  LifeCycleWatcher,
  ShadowlessElement,
} from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import { type ExtensionType, type Query, type Store } from '@blocksuite/store';
import { css, html, nothing, type PropertyValues } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { guard } from 'lit/directives/guard.js';
import { styleMap } from 'lit/directives/style-map.js';
import debounce from 'lodash-es/debounce';
const DEFAULT_PREVIEW_CONTAINER_WIDTH = 280;
const DEFAULT_PREVIEW_CONTAINER_HEIGHT = 166;

const styles = css`
  .frame-preview-container {
    display: block;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    position: relative;
  }

  .frame-preview-surface-container {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    overflow: hidden;
  }

  .frame-preview-viewport {
    max-width: 100%;
    box-sizing: border-box;
    margin: 0 auto;
    position: relative;
    overflow: hidden;
    pointer-events: none;
    user-select: none;
  }

  .frame-preview-viewport
    > editor-host
    > affine-edgeless-root-preview
    > .edgeless-background {
    background-color: transparent;
    background-image: none;
  }
`;

export const AFFINE_FRAME_PREVIEW = 'frame-preview';

export class FramePreview extends WithDisposable(ShadowlessElement) {
  static override styles = styles;

  private readonly _clearFrameDisposables = () => {
    this._frameDisposables?.dispose();
    this._frameDisposables = null;
  };

  private readonly _docFilter: Query = {
    mode: 'loose',
    match: [
      {
        flavour: 'affine:frame',
        viewType: 'hidden',
      },
    ],
  };

  private _frameDisposables: DisposableGroup | null = null;

  private _previewDoc: Store | null = null;

  private _runtimePreviewExt: ExtensionType[] = [];

  private get _viewExtensionManager() {
    return this.std.get(ViewExtensionManagerIdentifier);
  }

  private get _previewSpec() {
    return this._viewExtensionManager.get('preview-edgeless');
  }

  private readonly _updateFrameViewportWH = () => {
    const [, , w, h] = deserializeXYWH(this.frame.xywh);

    let scale = 1;
    if (this.fillScreen) {
      scale = Math.max(this.surfaceWidth / w, this.surfaceHeight / h);
    } else {
      scale = Math.min(this.surfaceWidth / w, this.surfaceHeight / h);
    }

    this.frameViewportWH = {
      width: w * scale,
      height: h * scale,
    };
  };

  get _originalDoc() {
    return this.frame.store;
  }

  private _initPreviewDoc() {
    const doc = this._originalDoc.workspace.getDoc(this._originalDoc.id);
    this._previewDoc =
      doc?.getStore({ readonly: true, query: this._docFilter }) ?? null;
    this.disposables.add(() => {
      this._originalDoc.doc.removeStore({ query: this._docFilter });
    });
  }

  private _initSpec() {
    const refreshViewport = this._refreshViewport.bind(this);
    class FramePreviewWatcher extends LifeCycleWatcher {
      static override key = 'frame-preview-watcher';

      override mounted() {
        const std = this.std;
        const { view } = std;
        view.viewUpdated.subscribe(payload => {
          if (
            payload.type !== 'block' ||
            payload.method !== 'add' ||
            payload.view.model.flavour !== 'affine:page'
          ) {
            return;
          }
          const viewport = std.get(GfxControllerIdentifier).viewport;
          const subscription = viewport.sizeUpdated.subscribe(() => {
            subscription.unsubscribe();
            refreshViewport();
          });
        });
      }
    }

    const docModeService = this.std.get(DocModeProvider);
    this._runtimePreviewExt = [
      ViewportElementExtension('.frame-preview-viewport'),
      FramePreviewWatcher,
      DocModeExtension(docModeService),
    ];
  }

  private _refreshViewport() {
    const previewEditorHost = this.previewEditor;

    if (!previewEditorHost) return;

    const { viewport } = previewEditorHost.std.get(GfxControllerIdentifier);
    const frameBound = Bound.deserialize(this.frame.xywh);
    viewport.setViewportByBound(frameBound);
  }

  private _renderSurfaceContent() {
    const { width, height } = this.frameViewportWH;

    const _previewSpec = this._previewSpec.concat(this._runtimePreviewExt);
    return html`<div
      class="frame-preview-surface-container"
      style=${styleMap({
        width: `${this.surfaceWidth}px`,
        height: `${this.surfaceHeight}px`,
      })}
    >
      <div
        class="frame-preview-viewport"
        style=${styleMap({
          width: `${width}px`,
          height: `${height}px`,
        })}
      >
        ${guard([this._previewDoc, this.frame], () => {
          if (!this._previewDoc || !this.frame) return nothing;
          return new BlockStdScope({
            store: this._previewDoc,
            extensions: _previewSpec,
          }).render();
        })}
      </div>
    </div>`;
  }

  private _setFrameDisposables(frame: FrameBlockModel) {
    this._clearFrameDisposables();
    this._frameDisposables = new DisposableGroup();
    this._frameDisposables.add(
      frame.propsUpdated.subscribe(
        debounce(this._updateFrameViewportWH, 10, { leading: true })
      )
    );
  }

  override connectedCallback() {
    super.connectedCallback();
    this._initSpec();
    this._initPreviewDoc();
    this._updateFrameViewportWH();
    this._setFrameDisposables(this.frame);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._clearFrameDisposables();
  }

  override render() {
    const { frame } = this;
    const noContent = !frame || !frame.xywh;

    return html`<div class="frame-preview-container">
      ${noContent ? nothing : this._renderSurfaceContent()}
    </div>`;
  }

  override updated(_changedProperties: PropertyValues) {
    if (_changedProperties.has('frame')) {
      this._setFrameDisposables(this.frame);
    }
    if (_changedProperties.has('frameViewportWH')) {
      this._refreshViewport();
    }
  }

  @property({ attribute: false })
  accessor std!: BlockStdScope;

  @state()
  accessor fillScreen = false;

  @property({ attribute: false })
  accessor frame!: FrameBlockModel;

  @state()
  accessor frameViewportWH = {
    width: 0,
    height: 0,
  };

  @query('editor-host')
  accessor previewEditor: EditorHost | null = null;

  @property({ attribute: false })
  accessor surfaceHeight: number = DEFAULT_PREVIEW_CONTAINER_HEIGHT;

  @property({ attribute: false })
  accessor surfaceWidth: number = DEFAULT_PREVIEW_CONTAINER_WIDTH;
}
