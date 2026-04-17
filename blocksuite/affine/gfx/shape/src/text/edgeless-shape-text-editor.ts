import {
  DefaultTool,
  EdgelessCRUDIdentifier,
  TextUtils,
} from '@blocksuite/affine-block-surface';
import type { ShapeElementModel } from '@blocksuite/affine-model';
import { MindmapElementModel, TextResizing } from '@blocksuite/affine-model';
import type { RichText } from '@blocksuite/affine-rich-text';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import { getSelectedRect } from '@blocksuite/affine-shared/utils';
import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import { Bound, toRadian, Vec } from '@blocksuite/global/gfx';
import { WithDisposable } from '@blocksuite/global/lit';
import {
  type BlockComponent,
  type BlockStdScope,
  ShadowlessElement,
  stdContext,
} from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import { InlineEditor, RANGE_SYNC_EXCLUDE_ATTR } from '@blocksuite/std/inline';
import { consume } from '@lit/context';
import { html, nothing } from 'lit';
import { property, query } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import * as Y from 'yjs';

function isShapeElement(element: unknown): element is ShapeElementModel {
  return (
    !!element &&
    typeof element === 'object' &&
    'type' in element &&
    element.type === 'shape'
  );
}

export function mountShapeTextEditor(
  shapeElement: { id: string } | null | undefined,
  edgeless: BlockComponent
) {
  const mountElm = edgeless.querySelector('.edgeless-mount-point');
  if (!mountElm) {
    throw new BlockSuiteError(
      ErrorCode.ValueNotExists,
      "edgeless block's mount point does not exist"
    );
  }

  const gfx = edgeless.std.get(GfxControllerIdentifier);
  const crud = edgeless.std.get(EdgelessCRUDIdentifier);

  if (!shapeElement?.id) {
    console.error('Cannot mount text editor on an invalid shape element');
    return;
  }

  const updatedElement = crud.getElementById(shapeElement.id);

  if (!isShapeElement(updatedElement)) {
    console.error('Cannot mount text editor on a non-shape element');
    return;
  }

  gfx.tool.setTool(DefaultTool);
  gfx.selection.set({
    elements: [updatedElement.id],
    editing: true,
  });

  if (!updatedElement.text) {
    const text = new Y.Text();
    crud.updateElement(updatedElement.id, { text });
  }

  const shapeEditor = new EdgelessShapeTextEditor();
  shapeEditor.element = updatedElement;

  mountElm.append(shapeEditor);
}

export class EdgelessShapeTextEditor extends WithDisposable(ShadowlessElement) {
  private _compositionUpdateRaf: number | null = null;

  private _keeping = false;

  private _lastXYWH = '';

  private _resizeObserver: ResizeObserver | null = null;

  get inlineEditor() {
    return this.richText.inlineEditor;
  }

  get crud() {
    return this.std.get(EdgelessCRUDIdentifier);
  }

  get gfx() {
    return this.std.get(GfxControllerIdentifier);
  }

  get selection() {
    return this.gfx.selection;
  }

  get inlineEditorContainer() {
    return this.inlineEditor?.rootElement;
  }

  get isMindMapNode() {
    return this.element.group instanceof MindmapElementModel;
  }

  private _initMindmapKeyBindings() {
    if (!this.isMindMapNode) {
      return;
    }
    const selection = this.selection;

    this._disposables.addFromEvent(this, 'keydown', evt => {
      switch (evt.key) {
        case 'Enter': {
          evt.stopPropagation();
          if (evt.shiftKey || evt.isComposing) return;

          (this.ownerDocument.activeElement as HTMLElement).blur();
          selection.set({
            elements: [this.element.id],
            editing: false,
          });
          break;
        }
        case 'Esc':
        case 'Tab': {
          evt.stopPropagation();
          (this.ownerDocument.activeElement as HTMLElement).blur();
          selection.set({
            elements: [this.element.id],
            editing: false,
          });
          break;
        }
      }
    });
  }

  private _stashMindMapTree() {
    if (!this.isMindMapNode) {
      return;
    }

    const mindmap = this.element.group as MindmapElementModel;
    const pop = mindmap.stashTree(mindmap.tree);

    this._disposables.add(() => {
      mindmap.layout();
      pop?.();
    });
  }

  private _unmount() {
    if (this._compositionUpdateRaf !== null) {
      cancelAnimationFrame(this._compositionUpdateRaf);
      this._compositionUpdateRaf = null;
    }

    this._resizeObserver?.disconnect();
    this._resizeObserver = null;

    if (this.element.text) {
      const text = this.element.text.toString();
      const trimed = text.trim();
      const len = trimed.length;
      if (len === 0) {
        this.element.text = undefined;
      } else if (len < text.length) {
        this.element.text = new Y.Text(trimed);
      }
    }

    this.element.textDisplay = true;

    this.remove();
    this.selection.set({
      elements: [],
      editing: false,
    });
  }

  private _scheduleElementWHUpdate(flush = false) {
    if (flush) {
      if (this._compositionUpdateRaf !== null) {
        cancelAnimationFrame(this._compositionUpdateRaf);
        this._compositionUpdateRaf = null;
      }
      this._updateElementWH();
      return;
    }

    if (this._compositionUpdateRaf !== null) {
      return;
    }

    this._compositionUpdateRaf = requestAnimationFrame(() => {
      this._compositionUpdateRaf = null;
      this._updateElementWH();
    });
  }

  private _getInlineEditorContentRect() {
    if (!this.inlineEditorContainer) {
      return null;
    }

    const textNodes = InlineEditor.getTextNodesFromElement(
      this.inlineEditorContainer
    );
    const firstText = textNodes[0];
    const lastText = textNodes.at(-1);

    if (!firstText || !lastText) {
      return null;
    }

    const range = this.ownerDocument.createRange();
    range.setStart(firstText, 0);
    range.setEnd(lastText, lastText.length);
    const rect = range.getBoundingClientRect();

    return rect.width > 0 || rect.height > 0 ? rect : null;
  }

  private _updateElementWH() {
    const bcr = this.richText.getBoundingClientRect();
    const [verticalPadding, horizontalPadding] = this.element.padding;
    const contentRect = this._getInlineEditorContentRect();
    const autoWidth =
      this.element.textResizing === TextResizing.AUTO_WIDTH_AND_HEIGHT;
    const constrainedAutoWidth = autoWidth && !!this.element.maxWidth;
    const maxAutoWidth =
      constrainedAutoWidth && typeof this.element.maxWidth === 'number'
        ? this.element.maxWidth
        : Number.POSITIVE_INFINITY;
    const nativeRangeRect = this.inlineEditor
      ?.getNativeRange()
      ?.getBoundingClientRect();
    const nativeRangeHeight =
      nativeRangeRect != null
        ? Math.max(0, nativeRangeRect.bottom - bcr.top + verticalPadding)
        : 0;
    const nativeRangeWidth =
      nativeRangeRect != null
        ? Math.max(0, nativeRangeRect.right - bcr.left + horizontalPadding)
        : 0;
    const editorContentHeight =
      this.inlineEditorContainer?.scrollHeight != null
        ? this.inlineEditorContainer.scrollHeight + verticalPadding * 2
        : 0;
    const editorContentWidth =
      this.inlineEditorContainer?.scrollWidth != null
        ? this.inlineEditorContainer.scrollWidth + horizontalPadding * 2
        : 0;
    const contentRectHeight =
      contentRect != null ? contentRect.height + verticalPadding * 2 : 0;
    const contentRectWidth =
      contentRect != null ? contentRect.width + horizontalPadding * 2 : 0;
    const containerHeight = Math.max(
      this.richText.offsetHeight,
      contentRectHeight,
      constrainedAutoWidth ? nativeRangeHeight : 0,
      autoWidth ? 0 : editorContentHeight
    );
    const containerWidth = Math.max(
      Math.min(this.richText.offsetWidth, maxAutoWidth),
      Math.min(contentRectWidth, maxAutoWidth),
      Math.min(nativeRangeWidth, maxAutoWidth),
      autoWidth ? 0 : editorContentWidth
    );

    const textResizing = this.element.textResizing;

    if (
      (containerHeight !== this.element.h &&
        textResizing === TextResizing.AUTO_HEIGHT) ||
      (textResizing === TextResizing.AUTO_WIDTH_AND_HEIGHT &&
        (containerWidth !== this.element.w ||
          containerHeight !== this.element.h))
    ) {
      const [leftTopX, leftTopY] = Vec.rotWith(
        [this.richText.offsetLeft, this.richText.offsetTop],
        [bcr.left + bcr.width / 2, bcr.top + bcr.height / 2],
        toRadian(-this.element.rotate)
      );

      const [modelLeftTopX, modelLeftTopY] = this.gfx.viewport.toModelCoord(
        leftTopX,
        leftTopY
      );

      this.crud.updateElement(this.element.id, {
        xywh: new Bound(
          modelLeftTopX,
          modelLeftTopY,
          textResizing === TextResizing.AUTO_WIDTH_AND_HEIGHT
            ? containerWidth
            : this.element.w,
          containerHeight
        ).serialize(),
      });

      if (this._lastXYWH !== this.element.xywh) {
        this.requestUpdate();
      }

      if (this.isMindMapNode) {
        const mindmap = this.element.group as MindmapElementModel;

        mindmap.layout(mindmap.tree, { applyStyle: false });
      }

      this.richText.style.minHeight = `${containerHeight}px`;
    }

    this.selection.set({
      elements: [this.element.id],
      editing: true,
    });
  }

  override connectedCallback() {
    super.connectedCallback();
    this.setAttribute(RANGE_SYNC_EXCLUDE_ATTR, 'true');
  }

  override firstUpdated(): void {
    const dispatcher = this.std.event;

    this.element.textDisplay = false;

    this.disposables.add(
      this.gfx.viewport.viewportUpdated.subscribe(() => {
        this.requestUpdate();
        this.updateComplete
          .then(() => {
            this._updateElementWH();
          })
          .catch(console.error);
      })
    );
    this.disposables.add(
      dispatcher.add('click', () => {
        return true;
      })
    );
    this.disposables.add(
      dispatcher.add('doubleClick', () => {
        return true;
      })
    );

    this.updateComplete
      .then(() => {
        if (!this.inlineEditor) return;

        if (this.element.group instanceof MindmapElementModel) {
          this.inlineEditor.selectAll();
        } else {
          this.inlineEditor.focusEnd();
        }

        this.disposables.add(
          this.inlineEditor.slots.renderComplete.subscribe(() => {
            this._updateElementWH();
          })
        );

        if (!this.inlineEditorContainer) return;
        this.disposables.addFromEvent(
          this.inlineEditorContainer,
          'blur',
          () => {
            if (this._keeping) return;
            this._unmount();
          }
        );

        this.disposables.addFromEvent(
          this.inlineEditorContainer,
          'compositionupdate',
          () => {
            this._scheduleElementWHUpdate();
          }
        );
        this.disposables.addFromEvent(
          this.inlineEditorContainer,
          'compositionend',
          () => {
            this._scheduleElementWHUpdate(true);
          }
        );
      })
      .catch(console.error);

    this.disposables.addFromEvent(this, 'keydown', evt => {
      if (evt.key === 'Escape') {
        requestAnimationFrame(() => {
          this.selection.set({
            elements: [this.element.id],
            editing: false,
          });
        });

        (this.ownerDocument.activeElement as HTMLElement).blur();
      }
    });

    this._initMindmapKeyBindings();
    this._stashMindMapTree();
  }

  override async getUpdateComplete(): Promise<boolean> {
    const result = await super.getUpdateComplete();
    await this.richText?.updateComplete;
    return result;
  }

  override render() {
    if (!this.element.text) {
      console.error('Failed to mount shape editor because of no text.');
      return nothing;
    }

    const [verticalPadding, horiPadding] = this.element.padding;
    const textResizing = this.element.textResizing;
    const viewport = this.gfx.viewport;
    const zoom = viewport.zoom;
    const rect = getSelectedRect([this.element]);
    const rotate = this.element.rotate;
    const [leftTopX, leftTopY] = Vec.rotWith(
      [rect.left, rect.top],
      [rect.left + rect.width / 2, rect.top + rect.height / 2],
      toRadian(rotate)
    );
    const [x, y] = this.gfx.viewport.toViewCoord(leftTopX, leftTopY);
    const autoWidth = textResizing === TextResizing.AUTO_WIDTH_AND_HEIGHT;
    const constrainedAutoWidth = autoWidth && !!this.element.maxWidth;
    const editorWidth = constrainedAutoWidth
      ? 'max-content'
      : textResizing === TextResizing.AUTO_HEIGHT
        ? rect.width + 'px'
        : 'fit-content';
    const color = this.std
      .get(ThemeProvider)
      .generateColorProperty(this.element.color, '#000000');

    const inlineEditorStyle = styleMap({
      position: 'absolute',
      left: x + 'px',
      top: y + 'px',
      width: editorWidth,
      // override rich-text style (height: 100%)
      height: 'initial',
      minHeight:
        textResizing === TextResizing.AUTO_WIDTH_AND_HEIGHT
          ? '1em'
          : `${rect.height}px`,
      maxWidth:
        textResizing === TextResizing.AUTO_WIDTH_AND_HEIGHT
          ? this.element.maxWidth
            ? `${this.element.maxWidth}px`
            : undefined
          : undefined,
      boxSizing: 'border-box',
      fontSize: this.element.fontSize + 'px',
      fontFamily: TextUtils.wrapFontFamily(this.element.fontFamily),
      fontWeight: this.element.fontWeight,
      lineHeight: 'normal',
      outline: 'none',
      transform: `scale(${zoom}, ${zoom}) rotate(${rotate}deg)`,
      transformOrigin: 'top left',
      color,
      padding: `${verticalPadding}px ${horiPadding}px`,
      textAlign: this.element.textAlign,
      display: 'grid',
      gridTemplateColumns: '100%',
      alignItems:
        this.element.textVerticalAlign === 'center'
          ? 'center'
          : this.element.textVerticalAlign === 'bottom'
            ? 'end'
            : 'start',
      alignContent: 'center',
      gap: '0',
      zIndex: '1',
    });

    this._lastXYWH = this.element.xywh;

    return html` <style>
        edgeless-shape-text-editor v-text [data-v-text] {
          overflow-wrap: ${constrainedAutoWidth
            ? 'anywhere'
            : autoWidth
              ? 'normal'
              : 'anywhere'};
          word-break: ${constrainedAutoWidth
            ? 'break-word'
            : autoWidth
              ? 'normal'
              : 'break-word'} !important;
          white-space: ${constrainedAutoWidth
            ? 'pre-wrap'
            : autoWidth
              ? 'pre'
              : 'pre-wrap'} !important;
        }

        edgeless-shape-text-editor .inline-editor {
          min-width: 1px;
        }
      </style>
      <rich-text
        .yText=${this.element.text}
        .enableFormat=${false}
        .enableAutoScrollHorizontally=${autoWidth && !this.isMindMapNode}
        style=${inlineEditorStyle}
      ></rich-text>`;
  }

  setKeeping(keeping: boolean) {
    this._keeping = keeping;
  }

  @property({ attribute: false })
  accessor element!: ShapeElementModel;

  @consume({
    context: stdContext,
  })
  accessor std!: BlockStdScope;

  @query('rich-text')
  accessor richText!: RichText;
}
