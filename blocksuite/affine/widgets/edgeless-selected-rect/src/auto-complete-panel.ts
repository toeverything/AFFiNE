import { EdgelessFrameManagerIdentifier } from '@blocksuite/affine-block-frame';
import {
  CanvasElementType,
  EdgelessCRUDIdentifier,
  getSurfaceBlock,
  getSurfaceComponent,
} from '@blocksuite/affine-block-surface';
import { FontFamilyIcon } from '@blocksuite/affine-components/icons';
import {
  mountShapeTextEditor,
  SHAPE_OVERLAY_HEIGHT,
  SHAPE_OVERLAY_WIDTH,
  ShapeComponentConfig,
} from '@blocksuite/affine-gfx-shape';
import {
  insertEdgelessTextCommand,
  mountTextElementEditor,
} from '@blocksuite/affine-gfx-text';
import type {
  Connection,
  ConnectorElementModel,
  ShapeElementModel,
} from '@blocksuite/affine-model';
import {
  DEFAULT_NOTE_WIDTH,
  DefaultTheme,
  FontFamily,
  FontStyle,
  FontWeight,
  getShapeName,
  GroupElementModel,
  NoteBlockModel,
  ShapeStyle,
  TextElementModel,
} from '@blocksuite/affine-model';
import {
  EditPropsStore,
  FeatureFlagService,
  ThemeProvider,
} from '@blocksuite/affine-shared/services';
import {
  captureEventTarget,
  matchModels,
} from '@blocksuite/affine-shared/utils';
import type { XYWH } from '@blocksuite/global/gfx';
import {
  Bound,
  clamp,
  normalizeDegAngle,
  serializeXYWH,
  toDegree,
  Vec,
} from '@blocksuite/global/gfx';
import { WithDisposable } from '@blocksuite/global/lit';
import { FrameIcon, PageIcon } from '@blocksuite/icons/lit';
import {
  type BlockComponent,
  type BlockStdScope,
  stdContext,
} from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import { consume } from '@lit/context';
import { baseTheme } from '@toeverything/theme';
import { css, html, LitElement, nothing, unsafeCSS } from 'lit';
import { property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';
import * as Y from 'yjs';

import {
  type AUTO_COMPLETE_TARGET_TYPE,
  AutoCompleteFrameOverlay,
  AutoCompleteNoteOverlay,
  AutoCompleteShapeOverlay,
  AutoCompleteTextOverlay,
  capitalizeFirstLetter,
  createShapeElement,
  DEFAULT_NOTE_OVERLAY_HEIGHT,
  DEFAULT_TEXT_HEIGHT,
  DEFAULT_TEXT_WIDTH,
  Direction,
  isShape,
  PANEL_HEIGHT,
  PANEL_WIDTH,
  type TARGET_SHAPE_TYPE,
} from './utils.js';

export class EdgelessAutoCompletePanel extends WithDisposable(LitElement) {
  static override styles = css`
    .auto-complete-panel-container {
      position: absolute;
      display: flex;
      width: 136px;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      padding: 8px 0;
      gap: 8px;
      border-radius: 8px;
      background: var(--affine-background-overlay-panel-color);
      box-shadow: var(--affine-shadow-2);
      z-index: 1;
    }

    .row-button {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 120px;
      height: 28px;
      padding: 4px 0;
      text-align: center;
      border-radius: 8px;
      font-family: ${unsafeCSS(baseTheme.fontSansFamily)};
      font-size: 12px;
      font-style: normal;
      font-weight: 500;
      border: 1px solid var(--affine-border-color, #e3e2e4);
      box-sizing: border-box;
    }
  `;

  private _overlay:
    | AutoCompleteShapeOverlay
    | AutoCompleteNoteOverlay
    | AutoCompleteFrameOverlay
    | AutoCompleteTextOverlay
    | null = null;

  get gfx() {
    return this.std.get(GfxControllerIdentifier);
  }

  constructor(
    position: [number, number],
    edgeless: BlockComponent,
    currentSource: ShapeElementModel | NoteBlockModel,
    connector: ConnectorElementModel
  ) {
    super();
    this.position = position;
    this.edgeless = edgeless;
    this.currentSource = currentSource;
    this.connector = connector;
  }

  get crud() {
    return this.std.get(EdgelessCRUDIdentifier);
  }

  get surface() {
    return getSurfaceComponent(this.std);
  }

  private _addFrame() {
    const bound = this._generateTarget(this.connector)?.nextBound;
    if (!bound) return;

    const { h } = bound;
    const w = h / 0.75;
    const target = this._getTargetXYWH(w, h);
    if (!target) return;

    const { xywh, position } = target;

    const edgeless = this.edgeless;
    const surfaceBlockModel = getSurfaceBlock(this.std.store);
    if (!surfaceBlockModel) return;
    const frameMgr = this.std.get(EdgelessFrameManagerIdentifier);
    const frameIndex = frameMgr.frames.length + 1;
    const props = this.std.get(EditPropsStore).applyLastProps('affine:frame', {
      title: new Y.Text(`Frame ${frameIndex}`),
      xywh: serializeXYWH(...xywh),
      presentationIndex: frameMgr.generatePresentationIndex(),
    });
    const id = this.crud.addBlock('affine:frame', props, surfaceBlockModel);
    edgeless.store.captureSync();
    const frame = this.crud.getElementById(id);
    if (!frame) return;

    this.connector.target = {
      id,
      position,
    };

    this.gfx.selection.set({
      elements: [frame.id],
      editing: false,
    });
  }

  private _addNote() {
    const { store } = this.edgeless;
    const target = this._getTargetXYWH(
      DEFAULT_NOTE_WIDTH,
      DEFAULT_NOTE_OVERLAY_HEIGHT
    );
    if (!target) return;

    const { xywh, position } = target;
    const id = this.crud.addBlock(
      'affine:note',
      {
        xywh: serializeXYWH(...xywh),
      },
      store.root?.id
    );
    const note = store.getBlock(id)?.model;
    if (!matchModels(note, [NoteBlockModel])) {
      return;
    }
    store.addBlock('affine:paragraph', { type: 'text' }, id);
    const group = this.currentSource.group;

    if (group instanceof GroupElementModel) {
      group.addChild(note);
    }
    this.connector.target = {
      id,
      position: position as [number, number],
    };
    this.crud.updateElement(this.connector.id, {
      target: { id, position },
    });
    this.gfx.selection.set({
      elements: [id],
      editing: false,
    });
  }

  private _addShape(targetType: TARGET_SHAPE_TYPE) {
    const edgeless = this.edgeless;
    const result = this._generateTarget(this.connector);
    if (!result) return;

    const currentSource = this.currentSource;
    const { nextBound, position } = result;
    const id = createShapeElement(edgeless, currentSource, targetType);
    if (!id) return;

    this.crud.updateElement(id, { xywh: nextBound.serialize() });
    this.crud.updateElement(this.connector.id, {
      target: { id, position },
    });

    mountShapeTextEditor(
      this.crud.getElementById(id) as ShapeElementModel,
      this.edgeless
    );
    this.gfx.selection.set({
      elements: [id],
      editing: true,
    });
    edgeless.store.captureSync();
  }

  private _addText() {
    const target = this._getTargetXYWH(DEFAULT_TEXT_WIDTH, DEFAULT_TEXT_HEIGHT);
    if (!target) return;
    const { xywh, position } = target;
    const bound = Bound.fromXYWH(xywh);

    const textFlag = this.edgeless.store
      .get(FeatureFlagService)
      .getFlag('enable_edgeless_text');
    if (textFlag) {
      const [_, { textId }] = this.edgeless.std.command.exec(
        insertEdgelessTextCommand,
        {
          x: bound.x,
          y: bound.y,
        }
      );
      if (!textId) return;

      const textElement = this.crud.getElementById(textId);
      if (!textElement) return;

      this.crud.updateElement(this.connector.id, {
        target: { id: textId, position },
      });
      if (this.currentSource.group instanceof GroupElementModel) {
        this.currentSource.group.addChild(textElement);
      }

      this.gfx.selection.set({
        elements: [textId],
        editing: false,
      });
      this.edgeless.store.captureSync();
    } else {
      const textId = this.crud.addElement(CanvasElementType.TEXT, {
        xywh: bound.serialize(),
        text: new Y.Text(),
        textAlign: 'left',
        fontSize: 24,
        fontFamily: FontFamily.Inter,
        color: DefaultTheme.textColor,
        fontWeight: FontWeight.Regular,
        fontStyle: FontStyle.Normal,
      });
      if (!textId) return;
      const textElement = this.crud.getElementById(textId);
      if (!(textElement instanceof TextElementModel)) {
        return;
      }

      this.crud.updateElement(this.connector.id, {
        target: { id: textId, position },
      });
      if (this.currentSource.group instanceof GroupElementModel) {
        this.currentSource.group.addChild(textElement);
      }

      this.gfx.selection.set({
        elements: [textId],
        editing: false,
      });
      this.edgeless.store.captureSync();

      mountTextElementEditor(textElement, this.edgeless);
    }
  }

  private _autoComplete(targetType: AUTO_COMPLETE_TARGET_TYPE) {
    this._removeOverlay();
    if (!this._connectorExist()) return;

    switch (targetType) {
      case 'text':
        this._addText();
        break;
      case 'note':
        this._addNote();
        break;
      case 'frame':
        this._addFrame();
        break;
      default:
        this._addShape(targetType);
    }

    this.remove();
  }

  private _connectorExist() {
    return !!this.crud.getElementById(this.connector.id);
  }

  private _generateTarget(connector: ConnectorElementModel) {
    const { currentSource } = this;
    let w = SHAPE_OVERLAY_WIDTH;
    let h = SHAPE_OVERLAY_HEIGHT;
    if (isShape(currentSource)) {
      const bound = Bound.deserialize(currentSource.xywh);
      w = bound.w;
      h = bound.h;
    }
    const point = connector.target.position;
    if (!point) return;

    const len = connector.path.length;
    const angle = normalizeDegAngle(
      toDegree(Vec.angle(connector.path[len - 2], connector.path[len - 1]))
    );
    let nextBound: Bound;
    let position: Connection['position'];
    // direction of the connector target arrow
    let direction: Direction;

    if (angle >= 45 && angle <= 135) {
      nextBound = new Bound(point[0] - w / 2, point[1], w, h);
      position = [0.5, 0];
      direction = Direction.Bottom;
    } else if (angle >= 135 && angle <= 225) {
      nextBound = new Bound(point[0] - w, point[1] - h / 2, w, h);
      position = [1, 0.5];
      direction = Direction.Left;
    } else if (angle >= 225 && angle <= 315) {
      nextBound = new Bound(point[0] - w / 2, point[1] - h, w, h);
      position = [0.5, 1];
      direction = Direction.Top;
    } else {
      nextBound = new Bound(point[0], point[1] - h / 2, w, h);
      position = [0, 0.5];
      direction = Direction.Right;
    }

    return { nextBound, position, direction };
  }

  private _getCurrentSourceInfo(): {
    style: ShapeStyle;
    type: AUTO_COMPLETE_TARGET_TYPE;
  } {
    const { currentSource } = this;
    if (isShape(currentSource)) {
      const { shapeType, shapeStyle, radius } = currentSource;
      return {
        style: shapeStyle,
        type: getShapeName(shapeType, radius),
      };
    }
    return {
      style: ShapeStyle.General,
      type: 'note',
    };
  }

  private _getPanelPosition() {
    const { viewport } = this.gfx;
    const { boundingClientRect: viewportRect, zoom } = viewport;
    const result = this._getTargetXYWH(PANEL_WIDTH / zoom, PANEL_HEIGHT / zoom);
    const pos = result ? result.xywh.slice(0, 2) : this.position;
    const coord = viewport.toViewCoord(pos[0], pos[1]);
    const { width, height } = viewportRect;

    coord[0] = clamp(coord[0], 20, width - 20 - PANEL_WIDTH);
    coord[1] = clamp(coord[1], 20, height - 20 - PANEL_HEIGHT);

    return coord;
  }

  private _getTargetXYWH(width: number, height: number) {
    const result = this._generateTarget(this.connector);
    if (!result) return null;

    const { nextBound: bound, direction, position } = result;
    if (!bound) return null;

    const { w, h } = bound;
    let x = bound.x;
    let y = bound.y;

    switch (direction) {
      case Direction.Right:
        y += h / 2 - height / 2;
        break;
      case Direction.Bottom:
        x -= width / 2 - w / 2;
        break;
      case Direction.Left:
        y += h / 2 - height / 2;
        x -= width - w;
        break;
      case Direction.Top:
        x -= width / 2 - w / 2;
        y += h - height;
        break;
    }

    const xywh = [x, y, width, height] as XYWH;

    return { xywh, position };
  }

  private _removeOverlay() {
    if (this._overlay && this.surface) {
      this.surface.renderer.removeOverlay(this._overlay);
    }
  }

  private _showFrameOverlay() {
    if (!this.surface) return;

    const bound = this._generateTarget(this.connector)?.nextBound;
    if (!bound) return;

    const { h } = bound;
    const w = h / 0.75;
    const xywh = this._getTargetXYWH(w, h)?.xywh;
    if (!xywh) return;

    const strokeColor = this.std
      .get(ThemeProvider)
      .getCssVariableColor('--affine-black-30');
    this._overlay = new AutoCompleteFrameOverlay(this.gfx, xywh, strokeColor);
    this.surface.renderer.addOverlay(this._overlay);
  }

  private _showNoteOverlay() {
    const xywh = this._getTargetXYWH(
      DEFAULT_NOTE_WIDTH,
      DEFAULT_NOTE_OVERLAY_HEIGHT
    )?.xywh;
    if (!xywh) return;
    if (!this.surface) return;

    const background = this.edgeless.std
      .get(ThemeProvider)
      .getColorValue(
        this.edgeless.std.get(EditPropsStore).lastProps$.value['affine:note']
          .background,
        DefaultTheme.noteBackgrounColor,
        true
      );
    this._overlay = new AutoCompleteNoteOverlay(this.gfx, xywh, background);
    this.surface.renderer.addOverlay(this._overlay);
  }

  private _showOverlay(targetType: AUTO_COMPLETE_TARGET_TYPE) {
    this._removeOverlay();
    if (!this._connectorExist()) return;
    if (!this.surface) return;

    switch (targetType) {
      case 'text':
        this._showTextOverlay();
        break;
      case 'note':
        this._showNoteOverlay();
        break;
      case 'frame':
        this._showFrameOverlay();
        break;
      default:
        this._showShapeOverlay(targetType);
    }

    this.surface.refresh();
  }

  private _showShapeOverlay(targetType: TARGET_SHAPE_TYPE) {
    const bound = this._generateTarget(this.connector)?.nextBound;
    if (!bound) return;
    if (!this.surface) return;

    const { x, y, w, h } = bound;
    const xywh = [x, y, w, h] as XYWH;
    const { shapeStyle, strokeColor, fillColor, strokeWidth, roughness } =
      this.edgeless.std.get(EditPropsStore).lastProps$.value[
        `shape:${targetType}`
      ];

    const stroke = this.edgeless.std
      .get(ThemeProvider)
      .getColorValue(strokeColor, DefaultTheme.shapeStrokeColor, true);
    const fill = this.edgeless.std
      .get(ThemeProvider)
      .getColorValue(fillColor, DefaultTheme.shapeFillColor, true);

    const options = {
      seed: 666,
      roughness: roughness,
      strokeLineDash: [0, 0],
      stroke,
      strokeWidth,
      fill,
    };

    this._overlay = new AutoCompleteShapeOverlay(
      this.gfx,
      xywh,
      targetType,
      options,
      shapeStyle
    );

    this.surface.renderer.addOverlay(this._overlay);
  }

  private _showTextOverlay() {
    const xywh = this._getTargetXYWH(
      DEFAULT_TEXT_WIDTH,
      DEFAULT_TEXT_HEIGHT
    )?.xywh;
    if (!xywh) return;
    if (!this.surface) return;

    this._overlay = new AutoCompleteTextOverlay(this.gfx, xywh);
    this.surface.renderer.addOverlay(this._overlay);
  }

  override connectedCallback() {
    super.connectedCallback();
    this.edgeless.handleEvent('click', ctx => {
      const { target } = ctx.get('pointerState').raw;
      const element = captureEventTarget(target);
      const clickAway = !element?.closest('edgeless-auto-complete-panel');
      if (clickAway) this.remove();
    });
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._removeOverlay();
  }

  override firstUpdated() {
    this.disposables.add(
      this.gfx.viewport.viewportUpdated.subscribe(() => this.requestUpdate())
    );
  }

  override render() {
    const position = this._getPanelPosition();
    if (!position) return nothing;

    const style = styleMap({
      left: `${position[0]}px`,
      top: `${position[1]}px`,
    });
    const { style: currentSourceStyle, type: currentSourceType } =
      this._getCurrentSourceInfo();

    const shapeButtons = repeat(
      ShapeComponentConfig,
      ({ name, generalIcon, scribbledIcon, tooltip }) => html`
        <edgeless-tool-icon-button
          .tooltip=${tooltip}
          .iconSize=${'20px'}
          @pointerenter=${() => this._showOverlay(name)}
          @pointerleave=${() => this._removeOverlay()}
          @click=${() => this._autoComplete(name)}
        >
          ${currentSourceStyle === 'General' ? generalIcon : scribbledIcon}
        </edgeless-tool-icon-button>
      `
    );

    return html`<div class="auto-complete-panel-container" style=${style}>
      ${shapeButtons}

      <edgeless-tool-icon-button
        .tooltip=${'Text'}
        .iconSize=${'20px'}
        @pointerenter=${() => this._showOverlay('text')}
        @pointerleave=${() => this._removeOverlay()}
        @click=${() => this._autoComplete('text')}
      >
        ${FontFamilyIcon}
      </edgeless-tool-icon-button>
      <edgeless-tool-icon-button
        .tooltip=${'Note'}
        .iconSize=${'20px'}
        @pointerenter=${() => this._showOverlay('note')}
        @pointerleave=${() => this._removeOverlay()}
        @click=${() => this._autoComplete('note')}
      >
        ${PageIcon()}
      </edgeless-tool-icon-button>
      <edgeless-tool-icon-button
        .tooltip=${'Frame'}
        .iconSize=${'20px'}
        @pointerenter=${() => this._showOverlay('frame')}
        @pointerleave=${() => this._removeOverlay()}
        @click=${() => this._autoComplete('frame')}
      >
        ${FrameIcon()}
      </edgeless-tool-icon-button>

      <edgeless-tool-icon-button
        .iconContainerPadding=${0}
        .tooltip=${capitalizeFirstLetter(currentSourceType)}
        @pointerenter=${() => this._showOverlay(currentSourceType)}
        @pointerleave=${() => this._removeOverlay()}
        @click=${() => this._autoComplete(currentSourceType)}
      >
        <div class="row-button">Add a same object</div>
      </edgeless-tool-icon-button>
    </div>`;
  }

  @property({ attribute: false })
  accessor connector: ConnectorElementModel;

  @property({ attribute: false })
  accessor currentSource: ShapeElementModel | NoteBlockModel;

  @property({ attribute: false })
  accessor edgeless: BlockComponent;

  @property({ attribute: false })
  accessor position: [number, number];

  @consume({
    context: stdContext,
  })
  accessor std!: BlockStdScope;
}
