import {
  EdgelessCRUDIdentifier,
  getSurfaceBlock,
  type SurfaceBlockModel,
  SurfaceElementModel,
} from '@blocksuite/affine-block-surface';
import type { BlockCaptionEditor } from '@blocksuite/affine-components/caption';
import { Peekable } from '@blocksuite/affine-components/peek';
import {
  FrameBlockModel,
  RootBlockModel,
  type SurfaceRefBlockModel,
} from '@blocksuite/affine-model';
import {
  DocModeProvider,
  EditPropsStore,
  ThemeProvider,
  ViewportElementExtension,
} from '@blocksuite/affine-shared/services';
import {
  matchModels,
  requestConnectedFrame,
  SpecProvider,
} from '@blocksuite/affine-shared/utils';
import {
  BlockComponent,
  BlockSelection,
  BlockStdScope,
  type EditorHost,
  LifeCycleWatcher,
  TextSelection,
} from '@blocksuite/block-std';
import {
  GfxBlockElementModel,
  GfxControllerIdentifier,
  type GfxModel,
  GfxPrimitiveElementModel,
} from '@blocksuite/block-std/gfx';
import { DisposableGroup } from '@blocksuite/global/disposable';
import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import {
  Bound,
  deserializeXYWH,
  type SerializedXYWH,
} from '@blocksuite/global/gfx';
import { DeleteIcon, EdgelessIcon, FrameIcon } from '@blocksuite/icons/lit';
import type { BaseSelection, Store } from '@blocksuite/store';
import { css, html, nothing, type TemplateResult } from 'lit';
import { query, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import { noContentPlaceholder } from './utils.js';

const iconSize = { width: '20px', height: '20px' };
const REF_LABEL_ICON = {
  'affine:frame': FrameIcon(iconSize),
  DEFAULT_NOTE_HEIGHT: EdgelessIcon(iconSize),
} as Record<string, TemplateResult>;

const NO_CONTENT_TITLE = {
  'affine:frame': 'Frame',
  group: 'Group',
  DEFAULT: 'Content',
} as Record<string, string>;

const NO_CONTENT_REASON = {
  group: 'This content was ungrouped or deleted on edgeless mode',
  DEFAULT: 'This content was deleted on edgeless mode',
} as Record<string, string>;

@Peekable()
export class SurfaceRefBlockComponent extends BlockComponent<SurfaceRefBlockModel> {
  static override styles = css`
    .affine-surface-ref {
      position: relative;
      user-select: none;
      margin: 10px 0;
      break-inside: avoid;
    }

    @media print {
      .affine-surface-ref {
        outline: none !important;
      }
    }

    .ref-placeholder {
      padding: 26px 0px 0px;
    }

    .placeholder-image {
      margin: 0 auto;
      text-align: center;
    }

    .placeholder-text {
      margin: 12px auto 0;
      text-align: center;
      font-size: 28px;
      font-weight: 600;
      line-height: 36px;
      font-family: var(--affine-font-family);
    }

    .placeholder-action {
      margin: 32px auto 0;
      text-align: center;
    }

    .delete-button {
      width: 204px;
      padding: 4px 18px;

      display: inline-flex;
      justify-content: center;
      align-items: center;
      gap: 4px;

      border-radius: 8px;
      border: 1px solid var(--affine-border-color);

      font-family: var(--affine-font-family);
      font-size: 12px;
      font-weight: 500;
      line-height: 20px;

      background-color: transparent;
      cursor: pointer;
    }

    .delete-button > .icon > svg {
      color: var(--affine-icon-color);
      width: 16px;
      height: 16px;
      display: block;
    }

    .placeholder-reason {
      margin: 72px auto 0;
      padding: 10px;

      text-align: center;
      font-size: 12px;
      font-family: var(--affine-font-family);
      line-height: 20px;

      color: var(--affine-warning-color);
      background-color: var(--affine-background-error-color);
    }

    .ref-content {
      position: relative;
      padding: 20px;
      background-color: var(--affine-background-primary-color);
      background: radial-gradient(
        var(--affine-edgeless-grid-color) 1px,
        var(--affine-background-primary-color) 1px
      );
    }

    .ref-viewport {
      max-width: 100%;
      margin: 0 auto;
      position: relative;
      overflow: hidden;
      pointer-events: none;
      user-select: none;
    }

    .ref-viewport.frame {
      border-radius: 2px;
      border: 1px solid var(--affine-black-30);
    }

    .surface-ref-mask {
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      break-inside: avoid;
    }

    .surface-ref-mask:hover {
      background-color: rgba(211, 211, 211, 0.1);
    }

    .surface-ref-mask:hover .ref-label {
      display: block;
    }

    .ref-label {
      display: none;
      user-select: none;
    }

    .ref-label {
      position: absolute;
      left: 0;
      bottom: 0;

      width: 100%;
      padding: 8px 16px;
      border: 1px solid var(--affine-border-color);
      gap: 14px;

      background: var(--affine-background-primary-color);

      font-size: 12px;

      user-select: none;
    }

    .ref-label .title {
      display: inline-block;
      font-weight: 600;
      font-family: var(--affine-font-family);
      line-height: 20px;

      color: var(--affine-text-secondary-color);
    }

    .ref-label .title > svg {
      color: var(--affine-icon-secondary);
      display: inline-block;
      vertical-align: baseline;
      width: 20px;
      height: 20px;
      vertical-align: bottom;
    }

    .ref-label .suffix {
      display: inline-block;
      font-weight: 400;
      color: var(--affine-text-disable-color);
      line-height: 20px;
    }
  `;

  private _previewDoc: Store | null = null;

  private readonly _previewSpec = SpecProvider._.getSpec(
    'preview:edgeless'
  ).extend([ViewportElementExtension('.ref-viewport')]);

  private _referencedModel: GfxModel | null = null;

  private _referenceXYWH: SerializedXYWH | null = null;

  private _viewportEditor: EditorHost | null = null;

  private get _shouldRender() {
    return (
      this.isConnected &&
      // prevent surface-ref from render itself in loop
      !this.parentComponent?.closest('affine-surface-ref')
    );
  }

  get referenceModel() {
    return this._referencedModel;
  }

  private _deleteThis() {
    this.doc.deleteBlock(this.model);
  }

  private _focusBlock() {
    this.selection.update(() => {
      return [this.selection.create(BlockSelection, { blockId: this.blockId })];
    });
  }

  private _initHotkey() {
    const selection = this.host.selection;
    const addParagraph = () => {
      if (!this.doc.getParent(this.model)) return;

      const [paragraphId] = this.doc.addSiblingBlocks(this.model, [
        {
          flavour: 'affine:paragraph',
        },
      ]);
      const model = this.doc.getModelById(paragraphId);
      if (!model) return;

      requestConnectedFrame(() => {
        selection.update(selList => {
          return selList
            .filter<BaseSelection>(sel => !sel.is(BlockSelection))
            .concat(
              selection.create(TextSelection, {
                from: {
                  blockId: model.id,
                  index: 0,
                  length: 0,
                },
                to: null,
              })
            );
        });
      }, this);
    };

    this.bindHotKey({
      Enter: () => {
        if (!this._focused) return;
        addParagraph();
        return true;
      },
    });
  }

  private _initReferencedModel() {
    const surfaceModel = getSurfaceBlock(this.doc);
    this._surfaceModel = surfaceModel;

    const findReferencedModel = (): [GfxModel | null, string] => {
      if (!this.model.props.reference) return [null, this.doc.id];

      if (this.doc.getBlock(this.model.props.reference)) {
        return [
          this.doc.getBlock(this.model.props.reference)
            ?.model as GfxBlockElementModel,
          this.doc.id,
        ];
      }

      if (this._surfaceModel?.getElementById(this.model.props.reference)) {
        return [
          this._surfaceModel.getElementById(this.model.props.reference),
          this.doc.id,
        ];
      }

      const doc = [...this.std.workspace.docs.values()]
        .map(doc => doc.getStore())
        .find(
          doc =>
            doc.getBlock(this.model.props.reference) ||
            getSurfaceBlock(doc)?.getElementById(this.model.props.reference)
        );

      if (doc) {
        this._surfaceModel = getSurfaceBlock(doc);
      }

      if (doc && doc.getBlock(this.model.props.reference)) {
        return [
          doc.getBlock(this.model.props.reference)
            ?.model as GfxBlockElementModel,
          doc.id,
        ];
      }

      if (doc) {
        const surfaceBlock = getSurfaceBlock(doc);
        if (surfaceBlock) {
          return [
            surfaceBlock.getElementById(this.model.props.reference),
            doc.id,
          ];
        }
      }

      return [null, this.doc.id];
    };

    const init = () => {
      const [referencedModel, docId] = findReferencedModel();

      this._referencedModel =
        referencedModel && referencedModel.xywh ? referencedModel : null;
      this._previewDoc = this.doc.workspace.getDoc(docId, {
        readonly: true,
      });
      this._referenceXYWH = this._referencedModel?.xywh ?? null;
    };

    init();

    this._disposables.add(
      this.model.propsUpdated.subscribe(payload => {
        if (
          payload.key === 'reference' &&
          this.model.props.reference !== this._referencedModel?.id
        ) {
          init();
        }
      })
    );

    if (surfaceModel && this._referencedModel instanceof SurfaceElementModel) {
      this._disposables.add(
        surfaceModel.elementRemoved.subscribe(({ id }) => {
          if (this.model.props.reference === id) {
            init();
          }
        })
      );
    }

    if (this._referencedModel instanceof GfxBlockElementModel) {
      this._disposables.add(
        this.doc.slots.blockUpdated.subscribe(({ type, id }) => {
          if (type === 'delete' && id === this.model.props.reference) {
            init();
          }
        })
      );
    }
  }

  private _initSelection() {
    const selection = this.host.selection;
    this._disposables.add(
      selection.slots.changed.subscribe(selList => {
        this._focused = selList.some(
          sel => sel.blockId === this.blockId && sel.is(BlockSelection)
        );
      })
    );
  }

  private _initSpec() {
    const refreshViewport = this._refreshViewport.bind(this);
    class SurfaceRefViewportInitializer extends LifeCycleWatcher {
      static override readonly key = 'surfaceRefViewportInitializer';

      override mounted() {
        const disposable = this.std.view.viewUpdated.subscribe(payload => {
          if (payload.type !== 'block') return;
          if (
            payload.method === 'add' &&
            matchModels(payload.view.model, [RootBlockModel])
          ) {
            disposable.unsubscribe();
            queueMicrotask(() => refreshViewport());
            const gfx = this.std.get(GfxControllerIdentifier);
            gfx.viewport.sizeUpdated.subscribe(() => {
              refreshViewport();
            });
          }
        });
      }
    }
    this._previewSpec.extend([SurfaceRefViewportInitializer]);

    const referenceId = this.model.props.reference;
    const setReferenceXYWH = (xywh: typeof this._referenceXYWH) => {
      this._referenceXYWH = xywh;
    };

    class FrameGroupViewWatcher extends LifeCycleWatcher {
      static override readonly key = 'surface-ref-group-view-watcher';

      private readonly _disposable = new DisposableGroup();

      override mounted() {
        const crud = this.std.get(EdgelessCRUDIdentifier);
        const { _disposable } = this;
        const surfaceModel = getSurfaceBlock(this.std.store);
        if (!surfaceModel) return;

        const referenceElement = crud.getElementById(referenceId);
        if (!referenceElement) {
          throw new BlockSuiteError(
            ErrorCode.MissingViewModelError,
            `can not find element(id:${referenceElement})`
          );
        }

        if (referenceElement instanceof FrameBlockModel) {
          _disposable.add(
            referenceElement.xywh$.subscribe(xywh => {
              setReferenceXYWH(xywh);
              refreshViewport();
            })
          );
        } else if (referenceElement instanceof GfxPrimitiveElementModel) {
          _disposable.add(
            surfaceModel.elementUpdated.subscribe(({ id, oldValues }) => {
              if (
                id === referenceId &&
                oldValues.xywh !== referenceElement.xywh
              ) {
                setReferenceXYWH(referenceElement.xywh);
                refreshViewport();
              }
            })
          );
        }
      }

      override unmounted() {
        this._disposable.dispose();
      }
    }

    this._previewSpec.extend([FrameGroupViewWatcher]);
  }

  private _refreshViewport() {
    if (!this._referenceXYWH) return;

    const previewEditorHost = this.previewEditor;

    if (!previewEditorHost) return;

    const gfx = previewEditorHost.std.get(GfxControllerIdentifier);
    const viewport = gfx.viewport;

    viewport.setViewportByBound(Bound.deserialize(this._referenceXYWH));
  }

  private _renderMask(referencedModel: GfxModel, flavourOrType: string) {
    const title = 'title' in referencedModel ? referencedModel.title : '';

    return html`
      <div class="surface-ref-mask">
        <div class="ref-label">
          <div class="title">
            ${REF_LABEL_ICON[flavourOrType ?? 'DEFAULT'] ??
            REF_LABEL_ICON.DEFAULT}
            <span>${title}</span>
          </div>
          <div class="suffix">from edgeless mode</div>
        </div>
      </div>
    `;
  }

  private _renderRefContent(referencedModel: GfxModel) {
    const [, , w, h] = deserializeXYWH(referencedModel.xywh);
    const flavourOrType =
      'flavour' in referencedModel
        ? referencedModel.flavour
        : referencedModel.type;
    const _previewSpec = this._previewSpec.value;

    if (!this._viewportEditor) {
      if (this._previewDoc) {
        this._viewportEditor = new BlockStdScope({
          store: this._previewDoc,
          extensions: _previewSpec,
        }).render();
      } else {
        console.error('Preview doc is not found');
      }
    }

    return html`<div class="ref-content">
      <div
        class="ref-viewport ${flavourOrType === 'affine:frame' ? 'frame' : ''}"
        style=${styleMap({
          width: `${w}px`,
          aspectRatio: `${w} / ${h}`,
        })}
      >
        ${this._viewportEditor}
      </div>
      ${this._renderMask(referencedModel, flavourOrType)}
    </div>`;
  }

  private _renderRefPlaceholder(model: SurfaceRefBlockModel) {
    return html`<div class="ref-placeholder">
      <div class="placeholder-image">${noContentPlaceholder}</div>
      <div class="placeholder-text">
        No Such
        ${NO_CONTENT_TITLE[model.props.refFlavour ?? 'DEFAULT'] ??
        NO_CONTENT_TITLE.DEFAULT}
      </div>
      <div class="placeholder-action">
        <button class="delete-button" type="button" @click=${this._deleteThis}>
          <span class="icon">${DeleteIcon()}</span
          ><span>Delete this block</span>
        </button>
      </div>
      <div class="placeholder-reason">
        ${NO_CONTENT_REASON[model.props.refFlavour ?? 'DEFAULT'] ??
        NO_CONTENT_REASON.DEFAULT}
      </div>
    </div>`;
  }

  override connectedCallback() {
    super.connectedCallback();

    this.contentEditable = 'false';

    if (!this._shouldRender) return;

    this._initHotkey();
    this._initSpec();
    this._initReferencedModel();
    this._initSelection();
  }

  override render() {
    if (!this._shouldRender) return nothing;

    const { _surfaceModel, _referencedModel, model } = this;
    const isEmpty =
      !_surfaceModel || !_referencedModel || !_referencedModel.xywh;
    const content = isEmpty
      ? this._renderRefPlaceholder(model)
      : this._renderRefContent(_referencedModel);
    const edgelessTheme = this.std.get(ThemeProvider).edgeless$.value;

    return html`
      <div
        class="affine-surface-ref"
        data-theme=${edgelessTheme}
        @click=${this._focusBlock}
        style=${styleMap({
          outline: this._focused
            ? '2px solid var(--affine-primary-color)'
            : undefined,
        })}
      >
        ${content}
      </div>

      <block-caption-editor></block-caption-editor>

      ${Object.values(this.widgets)}
    `;
  }

  viewInEdgeless() {
    if (!this._referenceXYWH) return;

    const viewport = {
      xywh: this._referenceXYWH,
      padding: [60, 20, 20, 20] as [number, number, number, number],
    };

    this.std.get(EditPropsStore).setStorage('viewport', viewport);
    this.std.get(DocModeProvider).setEditorMode('edgeless');
  }

  override willUpdate(_changedProperties: Map<PropertyKey, unknown>): void {
    if (_changedProperties.has('_referencedModel')) {
      this._refreshViewport();
    }
  }

  @state()
  private accessor _focused: boolean = false;

  @state()
  private accessor _surfaceModel: SurfaceBlockModel | null = null;

  @query('affine-surface-ref > block-caption-editor')
  accessor captionElement!: BlockCaptionEditor;

  @query('editor-host')
  accessor previewEditor!: EditorHost | null;
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-surface-ref': SurfaceRefBlockComponent;
  }
}
