import {
  DefaultTool,
  EdgelessCRUDIdentifier,
  TextUtils,
} from '@blocksuite/affine-block-surface';
import {
  MindmapElementModel,
  ShapeElementModel,
  TextResizing,
} from '@blocksuite/affine-model';
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
import { RANGE_SYNC_EXCLUDE_ATTR } from '@blocksuite/std/inline';
import { consume } from '@lit/context';
import { html, nothing } from 'lit';
import { property, query } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import * as Y from 'yjs';

export function mountShapeTextEditor(
  shapeElement: ShapeElementModel,
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

  const updatedElement = crud.getElementById(shapeElement.id);

  if (!(updatedElement instanceof ShapeElementModel)) {
    console.error('Cannot mount text editor on a non-shape element');
    return;
  }

  gfx.tool.setTool(DefaultTool);
  gfx.selection.set({
    elements: [shapeElement.id],
    editing: true,
  });

  if (!shapeElement.text) {
    const text = new Y.Text();
    edgeless.std
      .get(EdgelessCRUDIdentifier)
      .updateElement(shapeElement.id, { text });
  }

  const shapeEditor = new EdgelessShapeTextEditor();
  shapeEditor.element = updatedElement;

  mountElm.append(shapeEditor);
}

export class EdgelessShapeTextEditor extends WithDisposable(ShadowlessElement) {
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

  private _updateElementWH() {
    const bcr = this.richText.getBoundingClientRect();
    const containerHeight = this.richText.offsetHeight;
    const containerWidth = this.richText.offsetWidth;
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

        mindmap.layout();
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
    const color = this.std
      .get(ThemeProvider)
      .generateColorProperty(this.element.color, '#000000');

    const inlineEditorStyle = styleMap({
      position: 'absolute',
      left: x + 'px',
      top: y + 'px',
      width:
        textResizing === TextResizing.AUTO_HEIGHT
          ? rect.width + 'px'
          : 'fit-content',
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
          overflow-wrap: ${autoWidth ? 'normal' : 'anywhere'};
          word-break: ${autoWidth ? 'normal' : 'break-word'} !important;
          white-space: ${autoWidth ? 'pre' : 'pre-wrap'} !important;
        }

        edgeless-shape-text-editor .inline-editor {
          min-width: 1px;
        }
      </style>
      <rich-text
        .yText=${this.element.text}
        .enableFormat=${false}
        .enableAutoScrollHorizontally=${false}
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
