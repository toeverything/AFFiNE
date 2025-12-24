import {
  DefaultTool,
  EdgelessCRUDIdentifier,
} from '@blocksuite/affine-block-surface';
import { getLineHeight } from '@blocksuite/affine-gfx-text';
import type { ConnectorElementModel } from '@blocksuite/affine-model';
import type { RichText } from '@blocksuite/affine-rich-text';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import { almostEqual } from '@blocksuite/affine-shared/utils';
import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import { Bound, type IVec, Vec } from '@blocksuite/global/gfx';
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
import { css, html, nothing } from 'lit';
import { property, query } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import * as Y from 'yjs';

const HORIZONTAL_PADDING = 2;
const VERTICAL_PADDING = 2;
const BORDER_WIDTH = 1;

export function mountConnectorLabelEditor(
  connector: ConnectorElementModel,
  edgeless: BlockComponent,
  point?: IVec
) {
  const mountElm = edgeless.querySelector('.edgeless-mount-point');
  if (!mountElm) {
    throw new BlockSuiteError(
      ErrorCode.ValueNotExists,
      "edgeless block's mount point does not exist"
    );
  }

  const gfx = edgeless.std.get(GfxControllerIdentifier);

  gfx.tool.setTool(DefaultTool);
  gfx.selection.set({
    elements: [connector.id],
    editing: true,
  });

  if (!connector.text) {
    const text = new Y.Text();
    const labelOffset = connector.labelOffset;
    let labelXYWH = connector.labelXYWH ?? [0, 0, 16, 16];

    if (point) {
      const center = connector.getNearestPoint(point);
      const distance = connector.getOffsetDistanceByPoint(center as IVec);
      const bounds = Bound.fromXYWH(labelXYWH);
      bounds.center = center;
      labelOffset.distance = distance;
      labelXYWH = bounds.toXYWH();
    }

    edgeless.std.get(EdgelessCRUDIdentifier).updateElement(connector.id, {
      text,
      labelXYWH,
      labelOffset: { ...labelOffset },
    });
  }

  const editor = new EdgelessConnectorLabelEditor();
  editor.connector = connector;

  mountElm.append(editor);
  editor.updateComplete
    .then(() => {
      editor.inlineEditor?.focusEnd();
    })
    .catch(console.error);
}

export class EdgelessConnectorLabelEditor extends WithDisposable(
  ShadowlessElement
) {
  static override styles = css`
    .edgeless-connector-label-editor {
      position: absolute;
      left: 0;
      top: 0;
      transform-origin: center;
      z-index: 10;
      padding: ${VERTICAL_PADDING}px ${HORIZONTAL_PADDING}px;
      border: ${BORDER_WIDTH}px solid var(--affine-primary-color, #1e96eb);
      background: var(--affine-background-primary-color, #fff);
      border-radius: 2px;
      box-shadow: 0px 0px 0px 2px rgba(30, 150, 235, 0.3);
      box-sizing: border-box;
      overflow: visible;

      .inline-editor {
        white-space: pre-wrap !important;
        outline: none;
      }

      .inline-editor span {
        word-break: normal !important;
        overflow-wrap: anywhere !important;
      }

      .edgeless-connector-label-editor-placeholder {
        pointer-events: none;
        color: var(--affine-text-disable-color);
        white-space: nowrap;
      }
    }
  `;

  get crud() {
    return this.std.get(EdgelessCRUDIdentifier);
  }

  get gfx() {
    return this.std.get(GfxControllerIdentifier);
  }

  get selection() {
    return this.gfx.selection;
  }

  private _isComposition = false;

  private _keeping = false;

  private _resizeObserver: ResizeObserver | null = null;

  private readonly _updateLabelRect = () => {
    const { connector, isConnected } = this;
    if (!connector || !isConnected) return;

    if (!this.inlineEditorContainer) return;

    const newWidth = this.inlineEditorContainer.scrollWidth;
    const newHeight = this.inlineEditorContainer.scrollHeight;
    const center = connector.getPointByOffsetDistance(
      connector.labelOffset.distance
    );
    const bounds = Bound.fromCenter(center, newWidth, newHeight);
    const labelXYWH = bounds.toXYWH();

    if (
      !connector.labelXYWH ||
      labelXYWH.some((p, i) => !almostEqual(p, connector.labelXYWH![i]))
    ) {
      this.crud.updateElement(connector.id, {
        labelXYWH,
      });
    }
  };

  get inlineEditor() {
    return this.richText.inlineEditor;
  }

  get inlineEditorContainer() {
    return this.inlineEditor?.rootElement;
  }

  override connectedCallback() {
    super.connectedCallback();
    this.setAttribute(RANGE_SYNC_EXCLUDE_ATTR, 'true');
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
  }

  override firstUpdated() {
    const { connector, selection, std } = this;
    const dispatcher = std.event;

    this._resizeObserver = new ResizeObserver(() => {
      this._updateLabelRect();
      this.requestUpdate();
    });
    this._resizeObserver.observe(this.richText);

    this.connector.stash('labelXYWH');

    this.updateComplete
      .then(() => {
        if (!this.inlineEditor) return;
        this.inlineEditor.selectAll();

        this.inlineEditor.slots.renderComplete.subscribe(() => {
          this.requestUpdate();
        });

        this.disposables.add(
          dispatcher.add('keyDown', ctx => {
            const state = ctx.get('keyboardState');
            const { key, ctrlKey, metaKey, altKey, shiftKey, isComposing } =
              state.raw;
            const onlyCmd = (ctrlKey || metaKey) && !altKey && !shiftKey;
            const isModEnter = onlyCmd && key === 'Enter';
            const isEscape = key === 'Escape';
            if (!isComposing && (isModEnter || isEscape)) {
              this.inlineEditorContainer?.blur();

              selection.set({
                elements: [connector.id],
                editing: false,
              });
              return true;
            }
            return false;
          })
        );

        const surface = this.gfx.surface;

        if (surface) {
          this.disposables.add(
            surface.elementUpdated.subscribe(({ id }) => {
              if (id === connector.id) this.requestUpdate();
            })
          );
        }

        this.disposables.add(
          this.gfx.viewport.viewportUpdated.subscribe(() => {
            this.requestUpdate();
          })
        );

        this.disposables.add(dispatcher.add('click', () => true));
        this.disposables.add(dispatcher.add('doubleClick', () => true));

        this.disposables.add(() => {
          if (connector.text) {
            const text = connector.text.toString();
            const trimed = text.trim();
            const len = trimed.length;
            if (len === 0) {
              // reset
              this.crud.updateElement(connector.id, {
                text: undefined,
                labelXYWH: undefined,
                labelOffset: undefined,
              });
            } else if (len < text.length) {
              this.crud.updateElement(connector.id, {
                // @TODO: trim in Y.Text?
                text: new Y.Text(trimed),
              });
            }
          }

          connector.labelEditing = false;
          connector.pop('labelXYWH');

          selection.set({
            elements: [],
            editing: false,
          });
        });

        if (!this.inlineEditorContainer) return;

        this.disposables.addFromEvent(
          this.inlineEditorContainer,
          'blur',
          () => {
            if (this._keeping) return;
            this.remove();
          }
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

        connector.labelEditing = true;
      })
      .catch(console.error);
  }

  override async getUpdateComplete(): Promise<boolean> {
    const result = await super.getUpdateComplete();
    await this.richText?.updateComplete;
    return result;
  }

  override render() {
    const { connector } = this;
    const {
      labelOffset: { distance },
      labelStyle: {
        fontFamily,
        fontSize,
        fontStyle,
        fontWeight,
        textAlign,
        color: labelColor,
      },
      labelConstraints: { hasMaxWidth, maxWidth },
    } = connector;

    const lineHeight = getLineHeight(fontFamily, fontSize, fontWeight);
    const { translateX, translateY, zoom } = this.gfx.viewport;
    const [x, y] = Vec.mul(connector.getPointByOffsetDistance(distance), zoom);
    const transformOperation = [
      'translate(-50%, -50%)',
      `translate(${translateX}px, ${translateY}px)`,
      `translate(${x}px, ${y}px)`,
      `scale(${zoom})`,
    ];

    const isEmpty = !connector.text?.length && !this._isComposition;
    const color = this.std
      .get(ThemeProvider)
      .generateColorProperty(labelColor, '#000000');

    return html`
      <div
        class="edgeless-connector-label-editor"
        style=${styleMap({
          fontFamily: `"${fontFamily}"`,
          fontSize: `${fontSize}px`,
          fontStyle,
          fontWeight,
          textAlign,
          lineHeight: `${lineHeight}px`,
          maxWidth: hasMaxWidth
            ? `${maxWidth + BORDER_WIDTH * 2 + HORIZONTAL_PADDING * 2}px`
            : 'initial',
          color,
          transform: transformOperation.join(' '),
        })}
      >
        <rich-text
          .yText=${connector.text}
          .enableFormat=${false}
          style=${isEmpty
            ? styleMap({
                position: 'absolute',
                left: 0,
                top: 0,
                padding: `${VERTICAL_PADDING}px ${HORIZONTAL_PADDING}px`,
              })
            : nothing}
        ></rich-text>
        ${isEmpty
          ? html`
              <span class="edgeless-connector-label-editor-placeholder">
                Add text
              </span>
            `
          : nothing}
      </div>
    `;
  }

  setKeeping(keeping: boolean) {
    this._keeping = keeping;
  }

  @property({ attribute: false })
  accessor connector!: ConnectorElementModel;

  @consume({
    context: stdContext,
  })
  accessor std!: BlockStdScope;

  @query('rich-text')
  accessor richText!: RichText;
}
