import { FrameBlockComponent } from '@blocksuite/affine-block-frame';
import {
  EdgelessCRUDIdentifier,
  getSurfaceBlock,
} from '@blocksuite/affine-block-surface';
import type { BlockCaptionEditor } from '@blocksuite/affine-components/caption';
import { whenHover } from '@blocksuite/affine-components/hover';
import { Peekable } from '@blocksuite/affine-components/peek';
import { ViewExtensionManagerIdentifier } from '@blocksuite/affine-ext-loader';
import { RefNodeSlotsProvider } from '@blocksuite/affine-inline-reference';
import {
  FrameBlockModel,
  NoteBlockModel,
  type SurfaceRefBlockModel,
} from '@blocksuite/affine-model';
import {
  BlockElementCommentManager,
  DocModeProvider,
  EditPropsStore,
  type OpenDocMode,
  ThemeProvider,
  ToolbarRegistryIdentifier,
  ViewportElementExtension,
} from '@blocksuite/affine-shared/services';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import {
  ensureDocLoaded,
  requestConnectedFrame,
} from '@blocksuite/affine-shared/utils';
import { DisposableGroup } from '@blocksuite/global/disposable';
import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import { Bound, type SerializedXYWH } from '@blocksuite/global/gfx';
import {
  BlockComponent,
  BlockSelection,
  BlockStdScope,
  type EditorHost,
  LifeCycleWatcher,
  TextSelection,
} from '@blocksuite/std';
import {
  GfxBlockElementModel,
  GfxControllerIdentifier,
  type GfxModel,
  GfxPrimitiveElementModel,
} from '@blocksuite/std/gfx';
import type { BaseSelection, ExtensionType, Store } from '@blocksuite/store';
import { effect, signal } from '@preact/signals-core';
import { css, html, nothing } from 'lit';
import { query } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { guard } from 'lit/directives/guard.js';
import { styleMap } from 'lit/directives/style-map.js';

@Peekable({
  enableOn: (block: SurfaceRefBlockComponent) => !!block.referenceModel,
})
export class SurfaceRefBlockComponent extends BlockComponent<SurfaceRefBlockModel> {
  static override styles = css`
    affine-surface-ref {
      position: relative;
    }

    affine-surface-ref:not(:hover)
      affine-surface-ref-toolbar:not([data-open-menu-display='show']) {
      display: none;
    }

    .affine-surface-ref {
      position: relative;
      user-select: none;
      margin: 10px 0;
      break-inside: avoid;
      border-radius: 8px;
      border: 1px solid ${unsafeCSSVarV2('edgeless/frame/border/default')};
      background-color: ${unsafeCSSVarV2('layer/background/primary')};
      overflow: hidden;
    }

    .affine-surface-ref.focused {
      border-color: ${unsafeCSSVarV2('edgeless/frame/border/active')};
    }

    .affine-surface-ref.comment-highlighted {
      outline: 2px solid ${unsafeCSSVarV2('block/comment/highlightUnderline')};
    }

    @media print {
      .affine-surface-ref {
        outline: none !important;
      }
    }

    .ref-content {
      position: relative;
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
      user-select: none;
    }

    .ref-viewport-event-mask {
      position: absolute;
      inset: 0;
    }
  `;

  private _previewDoc: Store | null = null;

  private _runtimePreviewExt: ExtensionType[] = [];

  private get _viewExtensionManager() {
    return this.std.get(ViewExtensionManagerIdentifier);
  }

  private get _previewSpec() {
    return [
      ...this._viewExtensionManager.get('preview-edgeless'),
      ViewportElementExtension('.ref-viewport'),
    ];
  }

  private _referencedModel: GfxModel | null = null;

  // since the xywh of edgeless element is not a signal, we need to use a signal to store the xywh
  private readonly _referenceXYWH$ = signal<SerializedXYWH | null>(null);

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

  get isCommentHighlighted() {
    return (
      this.std
        .getOptional(BlockElementCommentManager)
        ?.isBlockCommentHighlighted(this.model) ?? false
    );
  }

  private readonly _handleClick = () => {
    this.selection.update(() => {
      return [this.selection.create(BlockSelection, { blockId: this.blockId })];
    });
  };

  private _initHotkey() {
    const selection = this.host.selection;
    const addParagraph = () => {
      if (!this.store.getParent(this.model)) return;

      const [paragraphId] = this.store.addSiblingBlocks(this.model, [
        {
          flavour: 'affine:paragraph',
        },
      ]);
      const model = this.store.getModelById(paragraphId);
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
        if (!this.selected$.value) return;
        addParagraph();
        return true;
      },
    });
  }

  private _initReferencedModel() {
    const findReferencedModel = (): [GfxModel | null, string] => {
      if (!this.model.props.reference) return [null, this.store.id];
      const referenceId = this.model.props.reference;

      const find = (doc: Store): [GfxModel | null, string] => {
        const block = doc.getBlock(referenceId)?.model;
        if (block instanceof GfxBlockElementModel) {
          return [block, doc.id];
        }
        const surfaceBlock = getSurfaceBlock(doc);
        if (!surfaceBlock) return [null, doc.id];

        const element = surfaceBlock.getElementById(referenceId);
        if (element) return [element, doc.id];

        return [null, doc.id];
      };

      // `refDocId` fast path: populated at creation time by the cross-doc
      // picker, so if it's set we already know exactly which doc to check —
      // no need to fall through to the brute-force scan below at all.
      // Existing surface-ref blocks (created before this field existed, or
      // via the same-doc-only slash-menu item) simply don't have it set,
      // so this is skipped for them entirely, preserving current behavior.
      const refDocId = this.model.props.refDocId;
      if (refDocId) {
        const refDoc = this.std.workspace.getDoc(refDocId);
        if (refDoc) {
          const result = find(refDoc.getStore());
          if (result[0]) return result;
        }
      }

      // find current doc first
      let result = find(this.store);
      if (result[0]) return result;

      // Legacy fallback: brute-force scan every loaded doc in the
      // workspace. Kept for backward compatibility with any surface-ref
      // blocks that predate `refDocId` (or whose `refDocId` didn't
      // resolve, e.g. a stale/incorrect value) — O(n) over every doc,
      // unindexed, relying entirely on `referenceId` being globally
      // unique. Not something new code should depend on.
      for (const doc of this.std.workspace.docs.values()) {
        result = find(doc.getStore());
        if (result[0]) return result;
      }

      return [null, this.store.id];
    };

    // Cross-doc reference: `refDoc.load()` flips `doc.ready` synchronously,
    // but the doc's actual Yjs content still streams in asynchronously
    // afterward (from local storage, or a real remote peer) — a doc that
    // hasn't been opened recently can take several seconds. Without this,
    // `init()` below can run before the target doc's content has arrived,
    // permanently conclude "not found," and never re-check — exactly the
    // "reference shows unavailable after reload, but the target is right
    // there once it finishes loading" symptom this retry closes.
    let clearPendingRetry: (() => void) | null = null;
    // Bounded: a target that's genuinely gone (deleted, wrong id) would
    // otherwise re-run full resolution on every single Yjs update to a
    // chatty doc, forever. Resets whenever resolution succeeds; only counts
    // attempts made while still unresolved.
    const MAX_RETRY_ATTEMPTS = 20;
    let retryAttempts = 0;

    const init = () => {
      clearPendingRetry?.();
      clearPendingRetry = null;

      const [referencedModel, docId] = findReferencedModel();

      this._referencedModel =
        referencedModel && referencedModel.xywh ? referencedModel : null;
      if (this._referencedModel) retryAttempts = 0;
      // TODO(@L-Sun): clear query cache
      const doc = this.store.workspace.getDoc(docId);
      this._previewDoc = doc?.getStore({ readonly: true }) ?? null;

      // `_initViewport` only ever reads `referenceModel` once, synchronously,
      // right after the first `init()` call — it has no way to notice
      // `_referencedModel` changing later (e.g. via this retry, or via any
      // of the other `init()` triggers below). Keep the viewport signal in
      // sync here so a later-arriving reference actually renders at the
      // right size instead of the viewport staying stuck at its original
      // (likely null) value forever.
      this._referenceXYWH$.value = this._referencedModel?.xywh ?? null;

      const refDocId = this.model.props.refDocId;
      if (
        !this._referencedModel &&
        refDocId &&
        retryAttempts < MAX_RETRY_ATTEMPTS
      ) {
        const refDoc = this.std.workspace.getDoc(refDocId);
        if (refDoc) {
          ensureDocLoaded(refDoc);
          // Debounced like `database-ref`'s own equivalent watcher — a doc
          // still streaming in from local storage can emit many `update`
          // events in quick succession, and each retry re-runs the full
          // (possibly brute-force-scanning) resolver.
          let debounce: ReturnType<typeof setTimeout> | null = null;
          const onUpdate = () => {
            if (debounce) clearTimeout(debounce);
            debounce = setTimeout(() => {
              refDoc.spaceDoc.off('update', onUpdate);
              clearPendingRetry = null;
              retryAttempts++;
              init();
            }, 300);
          };
          refDoc.spaceDoc.on('update', onUpdate);
          clearPendingRetry = () => {
            if (debounce) clearTimeout(debounce);
            refDoc.spaceDoc.off('update', onUpdate);
          };
        }
      }

      this.requestUpdate();
    };

    init();
    this._disposables.add(() => clearPendingRetry?.());

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

    if (this._referencedModel instanceof GfxPrimitiveElementModel) {
      this._disposables.add(
        this._referencedModel.surface.elementRemoved.subscribe(({ id }) => {
          if (this.model.props.reference === id) {
            init();
          }
        })
      );
    }

    if (this._referencedModel instanceof GfxBlockElementModel) {
      this._disposables.add(
        this.store.slots.blockUpdated.subscribe(({ type, id }) => {
          if (type === 'delete' && id === this.model.props.reference) {
            init();
          }
        })
      );
    }
  }

  private _initViewport() {
    this._referenceXYWH$.value = this.referenceModel?.xywh ?? null;

    const refreshViewport = () => {
      if (!this._referenceXYWH$.value) return;
      const previewEditorHost = this.previewEditor;
      if (!previewEditorHost) return;
      const gfx = previewEditorHost.std.get(GfxControllerIdentifier);
      const viewport = gfx.viewport;

      viewport.setViewportByBound(
        Bound.deserialize(this._referenceXYWH$.value),
        this.referenceModel instanceof FrameBlockModel
          ? undefined
          : [20, 20, 20, 20]
      );
    };
    this.disposables.add(effect(refreshViewport));

    const referenceId = this.model.props.reference;
    const referenceXYWH$ = this._referenceXYWH$;
    const getRenderOptions = () => {
      const options =
        (this.referenceModel instanceof FrameBlockModel
          ? this.referenceModel.props.frameRenderOptions
          : undefined) ?? this.model.props.frameRenderOptions;
      return {
        showInnerFrames: options?.showInnerFrames ?? false,
        showGrid: options?.showGrid ?? false,
        showNotes: options?.showNotes ?? true,
      };
    };

    const applyRenderOptions = (
      host: HTMLElement,
      surfaceModels: readonly GfxPrimitiveElementModel[],
      referenceElement: GfxModel
    ) => {
      const { showInnerFrames, showGrid, showNotes } = getRenderOptions();
      const hiddenFrameIds = new Set<string>();
      const hiddenNoteIds = new Set<string>();
      const referencedFrame =
        referenceElement instanceof FrameBlockModel ? referenceElement : null;

      if (referencedFrame) {
        const frameBound = referencedFrame.elementBound;
        const queue = [...referencedFrame.childElements];
        while (queue.length) {
          const element = queue.shift();
          if (!element) continue;

          if (element instanceof FrameBlockModel) {
            if (!showInnerFrames) {
              hiddenFrameIds.add(element.id);
            }
            queue.push(...element.childElements);
            continue;
          }

          if (element instanceof NoteBlockModel && !showNotes) {
            hiddenNoteIds.add(element.id);
          }
        }

        for (const element of surfaceModels) {
          if (element.id === referencedFrame.id) continue;

          if (
            element instanceof FrameBlockModel &&
            !showInnerFrames &&
            frameBound.isOverlapWithBound(element.elementBound)
          ) {
            hiddenFrameIds.add(element.id);
            continue;
          }

          if (
            element instanceof NoteBlockModel &&
            !showNotes &&
            frameBound.isOverlapWithBound(element.elementBound)
          ) {
            hiddenNoteIds.add(element.id);
          }
        }
      }

      host
        .querySelectorAll<FrameBlockComponent>('affine-frame')
        .forEach(view => {
          const hidden = hiddenFrameIds.has(view.dataset.blockId ?? '');
          view.style.display = hidden ? 'none' : '';
          view.showBorder = showInnerFrames;
        });

      host
        .querySelectorAll<HTMLElement>('affine-edgeless-note')
        .forEach(view => {
          const hidden = hiddenNoteIds.has(view.dataset.blockId ?? '');
          view.style.display = hidden ? 'none' : '';
        });

      host
        .querySelectorAll<HTMLElement>('affine-edgeless-root-preview')
        .forEach(view => {
          (
            view as HTMLElement & { overrideBackground?: string }
          ).overrideBackground = showGrid
            ? undefined
            : 'var(--affine-background-primary-color)';
        });
    };

    class SurfaceRefViewportWatcher extends LifeCycleWatcher {
      static override readonly key = 'surface-ref-viewport-watcher';

      private readonly _disposable = new DisposableGroup();

      override mounted() {
        const crud = this.std.get(EdgelessCRUDIdentifier);
        const gfx = this.std.get(GfxControllerIdentifier);
        const { surface, viewport } = gfx;
        if (!surface) return;

        const referenceElement = crud.getElementById(referenceId);
        if (!referenceElement) {
          throw new BlockSuiteError(
            ErrorCode.MissingViewModelError,
            `can not find element(id:${referenceElement})`
          );
        }
        referenceXYWH$.value = referenceElement.xywh;

        const { _disposable } = this;
        refreshViewport();
        _disposable.add(viewport.sizeUpdated.subscribe(refreshViewport));

        if (referenceElement instanceof GfxBlockElementModel) {
          _disposable.add(
            referenceElement.xywh$.subscribe(xywh => {
              referenceXYWH$.value = xywh;
            })
          );
        } else if (referenceElement instanceof GfxPrimitiveElementModel) {
          _disposable.add(
            surface.elementUpdated.subscribe(({ id, oldValues }) => {
              if (
                id === referenceId &&
                oldValues.xywh !== referenceElement.xywh
              ) {
                referenceXYWH$.value = referenceElement.xywh;
              }
            })
          );
        }

        applyRenderOptions(
          this.std.host,
          surface.elementModels,
          referenceElement
        );

        _disposable.add(
          this.std.store.slots.blockUpdated.subscribe(payload => {
            if (
              payload.id !== referenceId ||
              payload.type !== 'update' ||
              payload.props.key !== 'frameRenderOptions'
            ) {
              return;
            }
            applyRenderOptions(
              this.std.host,
              surface.elementModels,
              referenceElement
            );
          })
        );

        const subscription = this.std.view.viewUpdated.subscribe(
          ({ id, type, method, view }) => {
            if (
              id === referenceElement.id &&
              type === 'block' &&
              method === 'add' &&
              view instanceof FrameBlockComponent
            ) {
              view.showBorder = false;
              subscription.unsubscribe();
            }
          }
        );
        _disposable.add(subscription);
      }

      override unmounted() {
        this._disposable.dispose();
      }
    }

    this._runtimePreviewExt = [SurfaceRefViewportWatcher];
  }

  private _initHover() {
    const { setReference, setFloating, dispose } = whenHover(
      hovered => {
        const message$ = this.std.get(ToolbarRegistryIdentifier).message$;
        if (hovered) {
          message$.value = {
            flavour: this.model.flavour,
            element: this,
            setFloating,
          };
          return;
        }

        // Clears previous bindings
        message$.value = null;
        setFloating();
      },
      { enterDelay: 500 }
    );
    setReference(this.hoverableContainer);
    this._disposables.add(dispose);
  }

  private _renderRefContent(useLegacyWidth: boolean) {
    if (!this._referenceXYWH$.value) return nothing;
    const { w, h } = Bound.deserialize(this._referenceXYWH$.value);
    const aspectRatio = h !== 0 ? w / h : 1;
    const sizeScale = normalizePositiveNumber(
      this.model.props.pageSizeScale,
      1
    );
    const adjustedAspectRatio =
      sizeScale === 1 ? aspectRatio : aspectRatio / sizeScale;
    const _previewSpec = this._previewSpec.concat(this._runtimePreviewExt);
    const edgelessTheme = this.std.get(ThemeProvider).edgeless$.value;

    const viewportStyle = useLegacyWidth
      ? { aspectRatio: `${adjustedAspectRatio}` }
      : { aspectRatio: `${adjustedAspectRatio}`, width: '100%' };

    return html`<div class="ref-content">
      <div
        class="ref-viewport"
        style=${styleMap(viewportStyle)}
        data-theme=${edgelessTheme}
      >
        ${guard(this._previewDoc, () => {
          return this._previewDoc
            ? new BlockStdScope({
                store: this._previewDoc,
                extensions: _previewSpec,
              }).render()
            : nothing;
        })}
        <div class="ref-viewport-event-mask"></div>
      </div>
    </div>`;
  }

  readonly open = ({
    openMode,
    event,
  }: {
    openMode?: OpenDocMode;
    event?: MouseEvent;
  } = {}) => {
    const pageId = this.referenceModel?.surface?.store.id;
    if (!pageId) return;

    this.std.getOptional(RefNodeSlotsProvider)?.docLinkClicked.next({
      pageId: pageId,
      params: {
        mode: 'edgeless',
        elementIds: [this.model.props.reference],
      },
      openMode,
      event,
      host: this.host,
    });
  };

  override connectedCallback() {
    super.connectedCallback();

    this.contentEditable = 'false';

    if (!this._shouldRender) return;

    this._initReferencedModel();
    this._initHotkey();
    this._initViewport();
  }

  override firstUpdated() {
    if (!this._shouldRender) return;

    this._initHover();
  }

  override render() {
    if (!this._shouldRender) return nothing;

    const { _referencedModel, model } = this;
    const isEmpty = !_referencedModel || !_referencedModel.xywh;
    const theme = this.std.get(ThemeProvider).theme$.value;
    const widthScale = normalizePositiveNumber(
      this.model.props.pageWidthScale,
      1
    );
    const widthMode = this.model.props.pageWidthMode ?? 'page';
    const useLegacyWidth =
      widthMode === 'page' || (widthMode === 'scale' && widthScale === 1);
    const content = isEmpty
      ? html`<surface-ref-placeholder
          .referenceModel=${_referencedModel}
          .refFlavour=${model.props.refFlavour$.value}
          .theme=${theme}
        ></surface-ref-placeholder>`
      : this._renderRefContent(useLegacyWidth);

    const baseWidth =
      widthMode === 'full'
        ? 'calc(100vw - (var(--affine-editor-side-padding, 0px) * 2))'
        : widthMode === 'scale'
          ? `calc(var(--affine-editor-width) * ${widthScale})`
          : 'var(--affine-editor-width)';
    const containerStyle = useLegacyWidth
      ? {}
      : {
          width: baseWidth,
          maxWidth: baseWidth,
          marginLeft: widthMode === 'full' ? '0' : 'auto',
          marginRight: widthMode === 'full' ? '0' : 'auto',
          position: 'relative',
          left: '50%',
          transform: 'translateX(-50%)',
        };

    return html`
      <div
        class=${classMap({
          'affine-surface-ref': true,
          focused: this.selected$.value,
          'comment-highlighted': this.isCommentHighlighted,
        })}
        style=${styleMap(containerStyle)}
        @click=${this._handleClick}
      >
        ${content}
      </div>

      <block-caption-editor></block-caption-editor>

      ${Object.values(this.widgets)}
    `;
  }

  viewInEdgeless() {
    if (!this._referenceXYWH$.value) return;

    const viewport = {
      xywh: this._referenceXYWH$.value,
      padding: [20, 20, 20, 20] as [number, number, number, number],
    };

    this.std.get(EditPropsStore).setStorage('viewport', viewport);
    this.std.get(DocModeProvider).setEditorMode('edgeless');
  }

  @query('.affine-surface-ref')
  accessor hoverableContainer!: HTMLDivElement;

  @query('affine-surface-ref > block-caption-editor')
  accessor captionElement!: BlockCaptionEditor;

  @query('editor-host')
  accessor previewEditor!: EditorHost | null;
}

function normalizePositiveNumber(value: number | undefined, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-surface-ref': SurfaceRefBlockComponent;
  }
}
