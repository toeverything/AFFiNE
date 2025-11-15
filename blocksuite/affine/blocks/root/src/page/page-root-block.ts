import { appendParagraphCommand } from '@blocksuite/affine-block-paragraph';
import {
  CodeBlockModel,
  ListBlockModel,
  NoteBlockModel,
  NoteDisplayMode,
  ParagraphBlockModel,
  type RootBlockModel,
} from '@blocksuite/affine-model';
import { focusTextModel } from '@blocksuite/affine-rich-text';
import {
  PageViewportService,
  ViewportElementProvider,
} from '@blocksuite/affine-shared/services';
import {
  focusTitle,
  getClosestBlockComponentByPoint,
  getDocTitleInlineEditor,
  getScrollContainer,
  matchModels,
} from '@blocksuite/affine-shared/utils';
import { Point } from '@blocksuite/global/gfx';
import type { PointerEventState } from '@blocksuite/std';
import { BlockComponent, BlockSelection, TextSelection } from '@blocksuite/std';
import type { BlockModel, Text } from '@blocksuite/store';
import { css, html } from 'lit';
import { query } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import { PageKeyboardManager } from '../keyboard/keyboard-manager.js';

const DOC_BLOCK_CHILD_PADDING = 24;
const DOC_BOTTOM_PADDING = 32;

function testClickOnBlankArea(
  state: PointerEventState,
  viewportLeft: number,
  viewportWidth: number,
  pageWidth: number,
  paddingLeft: number,
  paddingRight: number
) {
  const blankLeft =
    viewportLeft + (viewportWidth - pageWidth) / 2 + paddingLeft;
  const blankRight =
    viewportLeft + (viewportWidth - pageWidth) / 2 + pageWidth - paddingRight;

  return state.raw.clientX < blankLeft || state.raw.clientX > blankRight;
}

export class PageRootBlockComponent extends BlockComponent<RootBlockModel> {
  static override styles = css`
    editor-host:has(> affine-page-root, * > affine-page-root) {
      display: block;
      height: 100%;
    }

    affine-page-root {
      display: block;
      height: 100%;
      cursor: default;
    }

    .affine-page-root-block-container {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      font-family: var(--affine-font-family);
      font-size: var(--affine-font-base);
      line-height: var(--affine-line-height);
      color: var(--affine-text-primary-color);
      font-weight: 400;
      max-width: var(--affine-editor-width);
      margin: 0 auto;

      /* Leave a place for drag-handle */
      /* Do not use prettier format this style, or it will be broken */
      /* prettier-ignore */
      padding-left: var(--affine-editor-side-padding, ${DOC_BLOCK_CHILD_PADDING}px);
      /* prettier-ignore */
      padding-right: var(--affine-editor-side-padding, ${DOC_BLOCK_CHILD_PADDING}px);
      /* prettier-ignore */
      padding-bottom: var(--affine-editor-bottom-padding, ${DOC_BOTTOM_PADDING}px);
    }

    /* Extra small devices (phones, 640px and down) */
    @container viewport (width <= 640px) {
      .affine-page-root-block-container {
        padding-left: ${DOC_BLOCK_CHILD_PADDING}px;
        padding-right: ${DOC_BLOCK_CHILD_PADDING}px;
      }
    }

    .affine-block-element {
      display: block;
    }

    @media print {
      .selected {
        background-color: transparent !important;
      }
    }
  `;

  /**
   * Focus the first paragraph in the default note block.
   * If there is no paragraph, create one.
   * @return  { id: string, created: boolean }  id of the focused paragraph and whether it is created or not
   */
  focusFirstParagraph = (): { id: string; created: boolean } => {
    const defaultNote = this._getDefaultNoteBlock();
    const firstText = defaultNote?.children.find(block =>
      matchModels(block, [ParagraphBlockModel, ListBlockModel, CodeBlockModel])
    );
    if (firstText) {
      focusTextModel(this.std, firstText.id);
      return { id: firstText.id, created: false };
    } else {
      const newFirstParagraphId = this.store.addBlock(
        'affine:paragraph',
        {},
        defaultNote,
        0
      );
      focusTextModel(this.std, newFirstParagraphId);
      return { id: newFirstParagraphId, created: true };
    }
  };

  keyboardManager: PageKeyboardManager | null = null;

  prependParagraphWithText = (text: Text) => {
    const newFirstParagraphId = this.store.addBlock(
      'affine:paragraph',
      { text },
      this._getDefaultNoteBlock(),
      0
    );
    focusTextModel(this.std, newFirstParagraphId);
  };

  get rootScrollContainer() {
    return getScrollContainer(this);
  }

  get viewportProvider() {
    return this.std.get(ViewportElementProvider);
  }

  get viewport() {
    return this.viewportProvider.viewport;
  }

  get viewportElement(): HTMLElement {
    return this.viewportProvider.viewportElement;
  }

  private _createDefaultNoteBlock() {
    const { store } = this;

    const noteId = store.addBlock('affine:note', {}, store.root?.id);
    return store.getModelById(noteId) as NoteBlockModel;
  }

  private _getDefaultNoteBlock() {
    return (
      this.store.root?.children.find(
        child => child.flavour === 'affine:note'
      ) ?? this._createDefaultNoteBlock()
    );
  }

  private _initViewportResizeEffect() {
    const viewport = this.viewport;
    const viewportElement = this.viewportElement;
    if (!viewport || !viewportElement) {
      return;
    }

    const viewportService = this.std.get(PageViewportService);
    // when observe viewportElement resize, emit viewport update event
    const resizeObserver = new ResizeObserver(
      (entries: ResizeObserverEntry[]) => {
        for (const { target } of entries) {
          if (target === viewportElement) {
            viewportService.next(viewport);
            break;
          }
        }
      }
    );
    resizeObserver.observe(viewportElement);
    this.disposables.add(() => {
      resizeObserver.unobserve(viewportElement);
      resizeObserver.disconnect();
    });
  }

  override connectedCallback() {
    super.connectedCallback();

    this.keyboardManager = new PageKeyboardManager(this);

    this.bindHotKey({
      'Mod-a': () => {
        const blocks = this.model.children
          .filter(model => {
            if (matchModels(model, [NoteBlockModel])) {
              if (model.props.displayMode === NoteDisplayMode.EdgelessOnly)
                return false;

              return true;
            }
            return false;
          })
          .flatMap(model => {
            return model.children.map(child => {
              return this.std.selection.create(BlockSelection, {
                blockId: child.id,
              });
            });
          });
        this.std.selection.setGroup('note', blocks);
        return true;
      },
      ArrowUp: () => {
        const selection = this.host.selection;
        const sel = selection.value.find(
          sel => sel.is(TextSelection) || sel.is(BlockSelection)
        );
        if (!sel) return;
        let model: BlockModel | null = null;
        let current = this.store.getModelById(sel.blockId);
        while (current && !model) {
          if (current.flavour === 'affine:note') {
            model = current;
          } else {
            current = this.store.getParent(current);
          }
        }
        if (!model) return;
        const prevNote = this.store.getPrev(model);
        if (!prevNote || prevNote.flavour !== 'affine:note') {
          const isFirstText = sel.is(TextSelection) && sel.start.index === 0;
          const isBlock = sel.is(BlockSelection);
          if (isBlock || isFirstText) {
            focusTitle(this.host);
          }
          return;
        }
        const notes = this.store.getModelsByFlavour('affine:note');
        const index = notes.indexOf(prevNote);
        if (index !== 0) return;

        const range = this.std.range.value;
        requestAnimationFrame(() => {
          const currentRange = this.std.range.value;

          if (!range || !currentRange) return;

          // If the range has not changed, it means we need to manually move the cursor to the title.
          if (
            range.startContainer === currentRange.startContainer &&
            range.startOffset === currentRange.startOffset &&
            range.endContainer === currentRange.endContainer &&
            range.endOffset === currentRange.endOffset
          ) {
            const titleInlineEditor = getDocTitleInlineEditor(this.host);
            if (titleInlineEditor) {
              titleInlineEditor.focusEnd();
            }
          }
        });
      },
    });

    this.handleEvent('pointerDown', ctx => {
      const event = ctx.get('pointerState');
      if (
        event.raw.target !== this &&
        event.raw.target !== this.viewportElement &&
        event.raw.target !== this.rootElementContainer
      ) {
        return;
      }
      // prevent cursor jump
      event.raw.preventDefault();
    });

    this.handleEvent('click', ctx => {
      const event = ctx.get('pointerState');
      if (
        event.raw.target !== this &&
        event.raw.target !== this.viewportElement &&
        event.raw.target !== this.rootElementContainer
      ) {
        return;
      }

      const notes = this.model.children.filter(
        (child): child is NoteBlockModel =>
          child instanceof NoteBlockModel &&
          child.props.displayMode !== NoteDisplayMode.EdgelessOnly
      );

      // make sure there is a block can be focused
      if (
        !this.store.readonly$.value &&
        (notes.length === 0 || notes[notes.length - 1].children.length === 0)
      ) {
        this.std.command.exec(appendParagraphCommand);
        return;
      }

      const { paddingLeft, paddingRight } = window.getComputedStyle(
        this.rootElementContainer
      );
      if (!this.viewport) return;
      const isClickOnBlankArea = testClickOnBlankArea(
        event,
        this.viewport.left,
        this.viewport.clientWidth,
        this.rootElementContainer.clientWidth,
        parseFloat(paddingLeft),
        parseFloat(paddingRight)
      );
      if (!isClickOnBlankArea && !this.store.readonly$.value) {
        const lastBlock = notes[notes.length - 1].lastChild();
        if (
          !lastBlock ||
          !matchModels(lastBlock, [ParagraphBlockModel]) ||
          lastBlock.props.text.length !== 0
        ) {
          this.std.command.exec(appendParagraphCommand);
        }
        return;
      }

      const hostRect = this.host.getBoundingClientRect();
      const x = hostRect.width / 2 + hostRect.left;
      const point = new Point(x, event.raw.clientY);
      const side = event.raw.clientX < x ? 'left' : 'right';

      const nearestBlock = getClosestBlockComponentByPoint(point);
      event.raw.preventDefault();
      if (nearestBlock) {
        const text = nearestBlock.model.text;
        if (text) {
          this.host.selection.setGroup('note', [
            this.host.selection.create(TextSelection, {
              from: {
                blockId: nearestBlock.model.id,
                index: side === 'left' ? 0 : text.length,
                length: 0,
              },
              to: null,
            }),
          ]);
        } else {
          this.host.selection.setGroup('note', [
            this.host.selection.create(BlockSelection, {
              blockId: nearestBlock.model.id,
            }),
          ]);
        }
      } else {
        if (this.host.selection.find(BlockSelection)) {
          this.host.selection.clear(['block']);
        }
      }

      return;
    });
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._disposables.dispose();
    this.keyboardManager = null;
  }

  override firstUpdated() {
    this._initViewportResizeEffect();
    const noteModels = this.model.children.filter(model =>
      matchModels(model, [NoteBlockModel])
    );
    noteModels.forEach(note => {
      this.disposables.add(
        note.propsUpdated.subscribe(({ key }) => {
          if (key === 'displayMode') {
            this.requestUpdate();
          }
        })
      );
    });
  }

  override renderBlock() {
    const widgets = html`${repeat(
      Object.entries(this.widgets),
      ([id]) => id,
      ([_, widget]) => widget
    )}`;

    const children = this.renderChildren(this.model, child => {
      const isNote = matchModels(child, [NoteBlockModel]);
      const note = child as NoteBlockModel;
      const displayOnEdgeless =
        !!note.props.displayMode &&
        note.props.displayMode === NoteDisplayMode.EdgelessOnly;
      // Should remove deprecated `hidden` property in the future
      return !(isNote && displayOnEdgeless);
    });

    this.contentEditable = String(!this.store.readonly$.value);

    return html`
      <div class="affine-page-root-block-container">${children} ${widgets}</div>
    `;
  }

  @query('.affine-page-root-block-container')
  accessor rootElementContainer!: HTMLDivElement;
}
