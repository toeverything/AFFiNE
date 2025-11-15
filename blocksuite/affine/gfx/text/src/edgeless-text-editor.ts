import {
  CanvasElementType,
  DefaultTool,
  EdgelessCRUDIdentifier,
  getSurfaceBlock,
  type IModelCoord,
  TextUtils,
} from '@blocksuite/affine-block-surface';
import { DefaultTheme, TextElementModel } from '@blocksuite/affine-model';
import type { RichText } from '@blocksuite/affine-rich-text';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import { getSelectedRect } from '@blocksuite/affine-shared/utils';
import { Bound, toRadian, Vec } from '@blocksuite/global/gfx';
import { WithDisposable } from '@blocksuite/global/lit';
import {
  type BlockComponent,
  type BlockStdScope,
  type PointerEventState,
  ShadowlessElement,
  stdContext,
} from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import { RANGE_SYNC_EXCLUDE_ATTR } from '@blocksuite/std/inline';
import { consume } from '@lit/context';
import { css, html, nothing } from 'lit';
import { property, query } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import * as Y from 'yjs';

import { getCursorByCoord, getLineHeight } from './element-renderer/utils';

export function mountTextElementEditor(
  textElement: TextElementModel,
  edgeless: BlockComponent,
  focusCoord?: IModelCoord
) {
  let cursorIndex = textElement.text.length;
  if (focusCoord) {
    cursorIndex = Math.min(
      getCursorByCoord(textElement, focusCoord),
      cursorIndex
    );
  }

  const textEditor = new EdgelessTextEditor();
  textEditor.element = textElement;

  edgeless.append(textEditor);
  textEditor.updateComplete
    .then(() => {
      textEditor.inlineEditor?.focusIndex(cursorIndex);
    })
    .catch(console.error);

  const gfx = edgeless.std.get(GfxControllerIdentifier);

  gfx.tool.setTool(DefaultTool);
  gfx.selection.set({
    elements: [textElement.id],
    editing: true,
  });
}

/**
 * @deprecated
 *
 * Canvas Text has been deprecated
 */
export function addText(edgeless: BlockComponent, event: PointerEventState) {
  const gfx = edgeless.std.get(GfxControllerIdentifier);
  const crud = edgeless.std.get(EdgelessCRUDIdentifier);
  const [x, y] = gfx.viewport.toModelCoord(event.x, event.y);
  const selected = gfx.getElementByPoint(x, y);

  if (!selected) {
    const [modelX, modelY] = gfx.viewport.toModelCoord(event.x, event.y);

    const id = edgeless.std
      .get(EdgelessCRUDIdentifier)
      .addElement(CanvasElementType.TEXT, {
        xywh: new Bound(modelX, modelY, 32, 32).serialize(),
        text: new Y.Text(),
      });
    if (!id) return;

    edgeless.store.captureSync();
    const textElement = crud.getElementById(id);
    if (!textElement) return;
    if (textElement instanceof TextElementModel) {
      mountTextElementEditor(textElement, edgeless);
    }
  }
}

export class EdgelessTextEditor extends WithDisposable(ShadowlessElement) {
  get crud() {
    return this.std.get(EdgelessCRUDIdentifier);
  }

  get gfx() {
    return this.std.get(GfxControllerIdentifier);
  }

  static BORDER_WIDTH = 1;

  static PADDING_HORIZONTAL = 10;

  static PADDING_VERTICAL = 6;

  static PLACEHOLDER_TEXT = 'Type from here';

  static override styles = css`
    .edgeless-text-editor {
      position: absolute;
      left: 0;
      top: 0;
      z-index: 10;
      transform-origin: left top;
      font-kerning: none;
      border: ${EdgelessTextEditor.BORDER_WIDTH}px solid
        var(--affine-primary-color, #1e96eb);
      border-radius: 4px;
      box-shadow: 0px 0px 0px 2px rgba(30, 150, 235, 0.3);
      padding: ${EdgelessTextEditor.PADDING_VERTICAL}px
        ${EdgelessTextEditor.PADDING_HORIZONTAL}px;
      overflow: visible;
    }

    .edgeless-text-editor .inline-editor {
      white-space: pre-wrap !important;
      outline: none;
    }

    .edgeless-text-editor .inline-editor span {
      word-break: normal !important;
      overflow-wrap: anywhere !important;
    }

    .edgeless-text-editor-placeholder {
      pointer-events: none;
      color: var(--affine-text-disable-color);
      white-space: nowrap;
    }
  `;

  private _isComposition = false;

  private _keeping = false;

  private readonly _updateRect = () => {
    const element = this.element;

    if (!element || !this.inlineEditorContainer) return;

    const newWidth = this.inlineEditorContainer.scrollWidth;
    const newHeight = this.inlineEditorContainer.scrollHeight;
    const bound = new Bound(element.x, element.y, newWidth, newHeight);
    const { x, y, w, h, rotate } = element;

    switch (element.textAlign) {
      case 'left':
        {
          const newPos = this.getCoordsOnLeftAlign(
            {
              x,
              y,
              w,
              h,
              r: toRadian(rotate),
            },
            newWidth,
            newHeight
          );

          bound.x = newPos.x;
          bound.y = newPos.y;
        }
        break;
      case 'center':
        {
          const newPos = this.getCoordsOnCenterAlign(
            {
              x,
              y,
              w,
              h,
              r: toRadian(rotate),
            },
            newWidth,
            newHeight
          );

          bound.x = newPos.x;
          bound.y = newPos.y;
        }
        break;
      case 'right':
        {
          const newPos = this.getCoordsOnRightAlign(
            {
              x,
              y,
              w,
              h,
              r: toRadian(rotate),
            },
            newWidth,
            newHeight
          );

          bound.x = newPos.x;
          bound.y = newPos.y;
        }
        break;
    }

    this.crud.updateElement(element.id, {
      xywh: bound.serialize(),
    });
  };

  get inlineEditor() {
    return this.richText.inlineEditor;
  }

  get inlineEditorContainer() {
    return this.inlineEditor?.rootElement;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (!this.element) {
      console.error('text element is not set.');
      return;
    }

    this.setAttribute(RANGE_SYNC_EXCLUDE_ATTR, 'true');
  }

  override firstUpdated(): void {
    const element = this.element;
    const dispatcher = this.std.event;
    const surface = getSurfaceBlock(this.std.store);
    if (!surface) {
      console.error('surface block is not found.');
      return;
    }

    this.updateComplete
      .then(() => {
        if (!this.inlineEditor) return;
        this.inlineEditor.slots.renderComplete.subscribe(() => {
          this._updateRect();
          this.requestUpdate();
        });

        this.disposables.add(
          surface.elementUpdated.subscribe(({ id }) => {
            if (id === element.id) this.requestUpdate();
          })
        );

        this.disposables.add(
          this.gfx.viewport.viewportUpdated.subscribe(() => {
            this.requestUpdate();
          })
        );

        this.disposables.add(dispatcher.add('click', () => true));
        this.disposables.add(dispatcher.add('doubleClick', () => true));

        this.disposables.add(() => {
          element.display = true;

          if (element.text.length === 0) {
            this.crud.deleteElements([element]);
          }

          this.gfx.selection.set({
            elements: [],
            editing: false,
          });
        });

        if (!this.inlineEditorContainer) return;
        this.disposables.addFromEvent(
          this.inlineEditorContainer,
          'blur',
          () => !this._keeping && this.remove()
        );

        this.disposables.addFromEvent(
          this.inlineEditorContainer,
          'compositionstart',
          () => {
            this._isComposition = true;
            this.requestUpdate();
          }
        );
        this.disposables.addFromEvent(
          this.inlineEditorContainer,
          'compositionend',
          () => {
            this._isComposition = false;
            this.requestUpdate();
          }
        );

        element.display = false;
      })
      .catch(console.error);
  }

  getContainerOffset() {
    const { PADDING_VERTICAL, PADDING_HORIZONTAL, BORDER_WIDTH } =
      EdgelessTextEditor;
    return `-${PADDING_HORIZONTAL + BORDER_WIDTH}px, -${
      PADDING_VERTICAL + BORDER_WIDTH
    }px`;
  }

  getCoordsOnCenterAlign(
    rect: { w: number; h: number; r: number; x: number; y: number },
    w1: number,
    h1: number
  ): { x: number; y: number } {
    const centerX = rect.x + rect.w / 2;
    const centerY = rect.y + rect.h / 2;

    let deltaXPrime = 0;
    let deltaYPrime = (-rect.h / 2) * Math.cos(rect.r);

    const vX = centerX + deltaXPrime;
    const vY = centerY + deltaYPrime;

    deltaXPrime = 0;
    deltaYPrime = (-h1 / 2) * Math.cos(rect.r);

    const newCenterX = vX - deltaXPrime;
    const newCenterY = vY - deltaYPrime;

    return { x: newCenterX - w1 / 2, y: newCenterY - h1 / 2 };
  }

  getCoordsOnLeftAlign(
    rect: { w: number; h: number; r: number; x: number; y: number },
    w1: number,
    h1: number
  ): { x: number; y: number } {
    const cX = rect.x + rect.w / 2;
    const cY = rect.y + rect.h / 2;

    let deltaXPrime =
      (-rect.w / 2) * Math.cos(rect.r) + (rect.h / 2) * Math.sin(rect.r);
    let deltaYPrime =
      (-rect.w / 2) * Math.sin(rect.r) - (rect.h / 2) * Math.cos(rect.r);

    const vX = cX + deltaXPrime;
    const vY = cY + deltaYPrime;

    deltaXPrime = (-w1 / 2) * Math.cos(rect.r) + (h1 / 2) * Math.sin(rect.r);
    deltaYPrime = (-w1 / 2) * Math.sin(rect.r) - (h1 / 2) * Math.cos(rect.r);

    const newCenterX = vX - deltaXPrime;
    const newCenterY = vY - deltaYPrime;

    return { x: newCenterX - w1 / 2, y: newCenterY - h1 / 2 };
  }

  getCoordsOnRightAlign(
    rect: { w: number; h: number; r: number; x: number; y: number },
    w1: number,
    h1: number
  ): { x: number; y: number } {
    const centerX = rect.x + rect.w / 2;
    const centerY = rect.y + rect.h / 2;

    let deltaXPrime =
      (rect.w / 2) * Math.cos(rect.r) - (-rect.h / 2) * Math.sin(rect.r);
    let deltaYPrime =
      (rect.w / 2) * Math.sin(rect.r) + (-rect.h / 2) * Math.cos(rect.r);

    const vX = centerX + deltaXPrime;
    const vY = centerY + deltaYPrime;

    deltaXPrime = (w1 / 2) * Math.cos(rect.r) - (-h1 / 2) * Math.sin(rect.r);
    deltaYPrime = (w1 / 2) * Math.sin(rect.r) + (-h1 / 2) * Math.cos(rect.r);

    const newCenterX = vX - deltaXPrime;
    const newCenterY = vY - deltaYPrime;

    return { x: newCenterX - w1 / 2, y: newCenterY - h1 / 2 };
  }

  override async getUpdateComplete(): Promise<boolean> {
    const result = await super.getUpdateComplete();
    await this.richText?.updateComplete;
    return result;
  }

  getVisualPosition(element: TextElementModel) {
    const { x, y, w, h, rotate } = element;
    return Vec.rotWith([x, y], [x + w / 2, y + h / 2], toRadian(rotate));
  }

  override render() {
    const {
      text,
      fontFamily,
      fontSize,
      fontWeight,
      fontStyle,
      textAlign,
      rotate,
      hasMaxWidth,
      w,
    } = this.element;
    const lineHeight = getLineHeight(fontFamily, fontSize, fontWeight);
    const rect = getSelectedRect([this.element]);

    const { translateX, translateY, zoom } = this.gfx.viewport;
    const [visualX, visualY] = this.getVisualPosition(this.element);
    const containerOffset = this.getContainerOffset();
    const transformOperation = [
      `translate(${translateX}px, ${translateY}px)`,
      `translate(${visualX * zoom}px, ${visualY * zoom}px)`,
      `scale(${zoom})`,
      `rotate(${rotate}deg)`,
      `translate(${containerOffset})`,
    ];

    const isEmpty = !text.length && !this._isComposition;
    const color = this.std
      .get(ThemeProvider)
      .generateColorProperty(this.element.color, DefaultTheme.textColor);

    return html`<div
      style=${styleMap({
        transform: transformOperation.join(' '),
        minWidth: hasMaxWidth ? `${rect.width}px` : 'none',
        maxWidth: hasMaxWidth ? `${w}px` : 'none',
        fontFamily: TextUtils.wrapFontFamily(fontFamily),
        fontSize: `${fontSize}px`,
        fontWeight,
        fontStyle,
        color,
        textAlign,
        lineHeight: `${lineHeight}px`,
        boxSizing: 'content-box',
      })}
      class="edgeless-text-editor"
    >
      <rich-text
        .yText=${text}
        .enableFormat=${false}
        .enableAutoScrollHorizontally=${false}
        style=${isEmpty
          ? styleMap({
              position: 'absolute',
              left: 0,
              top: 0,
              padding: `${EdgelessTextEditor.PADDING_VERTICAL}px
        ${EdgelessTextEditor.PADDING_HORIZONTAL}px`,
            })
          : nothing}
      ></rich-text>
      ${isEmpty
        ? html`<span class="edgeless-text-editor-placeholder">
            Type from here
          </span>`
        : nothing}
    </div>`;
  }

  setKeeping(keeping: boolean) {
    this._keeping = keeping;
  }

  @consume({ context: stdContext })
  accessor std!: BlockStdScope;

  @property({ attribute: false })
  accessor element!: TextElementModel;

  @query('rich-text')
  accessor richText!: RichText;
}
