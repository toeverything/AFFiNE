import {
  EdgelessLegacySlotIdentifier,
  OverlayIdentifier,
} from '@blocksuite/affine-block-surface';
import type { ConnectorElementModel } from '@blocksuite/affine-model';
import { ConnectorMode } from '@blocksuite/affine-model';
import { DisposableGroup } from '@blocksuite/global/disposable';
import type { IVec } from '@blocksuite/global/gfx';
import { Vec } from '@blocksuite/global/gfx';
import { WithDisposable } from '@blocksuite/global/lit';
import {
  type BlockComponent,
  type BlockStdScope,
  stdContext,
  storeContext,
} from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import type { Store } from '@blocksuite/store';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing, type TemplateResult } from 'lit';
import { property, query } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import type { ConnectionOverlay } from '../connector-manager';
import {
  type ConnectorSegment,
  constrainDrag,
  getCursorForSegment,
  parsePathToSegments,
  segmentsToPath,
  splitSegmentToSShape,
  updateSegmentPosition,
} from '../utils/connector-segment';

const SIZE = 12;
const HALF_SIZE = SIZE / 2;

export class EdgelessConnectorHandle extends WithDisposable(LitElement) {
  static override styles = css`
    .line-controller {
      position: absolute;
      width: ${SIZE}px;
      height: ${SIZE}px;
      box-sizing: border-box;
      border-radius: 50%;
      border: 2px solid var(--affine-text-emphasis-color);
      background-color: var(--affine-background-primary-color);
      cursor: pointer;
      z-index: 10;
      pointer-events: all;
      /**
       * Fix: pointerEvent stops firing after a short time.
       * When a gesture is started, the browser intersects the touch-action values of the touched element and its ancestors,
       * up to the one that implements the gesture (in other words, the first containing scrolling element)
       * https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action
       */
      touch-action: none;
    }
    .line-controller-hidden {
      display: none;
    }
    /* Segment handle styles - for draw.io-style segment dragging */
    .segment-handle {
      border-color: var(--affine-primary-color);
    }
    .segment-handle.horizontal {
      cursor: row-resize; /* Horizontal segments move up/down */
    }
    .segment-handle.vertical {
      cursor: col-resize; /* Vertical segments move left/right */
    }
  `;

  private _lastZoom = 1;

  /** Cached segments parsed from the current path */
  private _segments: ConnectorSegment[] = [];

  /** Index of the segment currently being dragged, or -1 if not dragging */
  private _draggingSegmentIndex = -1;

  /** Starting mouse position when segment drag began */
  private _dragStartPos: IVec = [0, 0];

  get connectionOverlay() {
    return this.std.get(OverlayIdentifier('connection')) as ConnectionOverlay;
  }

  get gfx() {
    return this.std.get(GfxControllerIdentifier);
  }

  get slots() {
    return this.std.get(EdgelessLegacySlotIdentifier);
  }

  private _bindEvent() {
    const slots = this.slots;

    this._disposables.addFromEvent(this._startHandler, 'pointerdown', e => {
      slots.elementResizeStart.next();
      this._capPointerDown(e, 'source');
    });
    this._disposables.addFromEvent(this._endHandler, 'pointerdown', e => {
      slots.elementResizeStart.next();
      this._capPointerDown(e, 'target');
    });
    this._disposables.add(() => {
      this.connectionOverlay.clear();
    });
  }

  /**
   * Handle pointer down on a segment handle.
   * Begins constrained segment dragging.
   */
  private _onSegmentPointerDown(e: PointerEvent, segmentIndex: number) {
    const { gfx, connector, slots, _disposables } = this;
    e.stopPropagation();

    // Prevent starting a new drag if already dragging
    if (this._draggingSegmentIndex >= 0) {
      return;
    }

    const segment = this._segments[segmentIndex];
    if (!segment || segment.type !== 'movable') {
      return;
    }

    this._draggingSegmentIndex = segmentIndex;
    this._dragStartPos = gfx.viewport.toModelCoordFromClientCoord([e.x, e.y]);

    slots.elementResizeStart.next();

    // Track the current segment index being dragged (may change after split)
    let currentSegmentIndex = segmentIndex;

    const onMove = (moveEvent: PointerEvent) => {
      const currentPos = gfx.viewport.toModelCoordFromClientCoord([
        moveEvent.x,
        moveEvent.y,
      ]);

      // Calculate raw delta
      const rawDeltaX = currentPos[0] - this._dragStartPos[0];
      const rawDeltaY = currentPos[1] - this._dragStartPos[1];

      // Get the current segment being dragged
      const currentSegment = this._segments[currentSegmentIndex];
      if (!currentSegment) return;

      // Constrain delta based on segment orientation
      const constrainedDelta = constrainDrag(
        currentSegment,
        rawDeltaX,
        rawDeltaY
      );

      let updatedSegments: ConnectorSegment[];

      // Check if this is a 2-point path (single segment) - needs splitting
      if (this._segments.length === 1) {
        // Split the segment into an S-shape
        updatedSegments = splitSegmentToSShape(
          this._segments,
          constrainedDelta
        );
        // After split, the movable segment is now at index 1 (middle segment)
        currentSegmentIndex = 1;
      } else {
        // Update existing segments normally
        updatedSegments = updateSegmentPosition(
          this._segments,
          currentSegmentIndex,
          constrainedDelta
        );
      }

      // Convert back to path
      const newPath = segmentsToPath(updatedSegments);

      // Update the connector path
      // The path is relative to the connector's xywh, but we're working in absolute coords
      // For now, update the path directly - this may need adjustment based on coordinate system
      connector.path = newPath;

      // Update start position for next delta calculation
      this._dragStartPos = currentPos;
      this._segments = updatedSegments;

      this.requestUpdate();
    };

    const onUp = () => {
      this._draggingSegmentIndex = -1;
      this.doc.captureSync();
      _disposables.dispose();
      this._disposables = new DisposableGroup();
      this._bindEvent();
      slots.elementResizeEnd.next();
    };

    _disposables.addFromEvent(document, 'pointermove', onMove);
    _disposables.addFromEvent(document, 'pointerup', onUp);
  }

  private _capPointerDown(e: PointerEvent, connection: 'target' | 'source') {
    const { gfx, connector, slots, _disposables } = this;
    e.stopPropagation();
    _disposables.addFromEvent(document, 'pointermove', e => {
      const point = gfx.viewport.toModelCoordFromClientCoord([e.x, e.y]);
      const isStartPointer = connection === 'source';
      const otherSideId = connector[isStartPointer ? 'target' : 'source'].id;

      connector[connection] = this.connectionOverlay.renderConnector(
        point,
        otherSideId ? [otherSideId] : []
      );
      this.requestUpdate();
    });

    _disposables.addFromEvent(document, 'pointerup', () => {
      this.doc.captureSync();
      _disposables.dispose();
      this._disposables = new DisposableGroup();
      this._bindEvent();
      slots.elementResizeEnd.next();
    });
  }

  override firstUpdated() {
    const { gfx } = this;
    const { viewport } = gfx;

    this._lastZoom = viewport.zoom;
    viewport.viewportUpdated.subscribe(() => {
      if (viewport.zoom !== this._lastZoom) {
        this._lastZoom = viewport.zoom;
        this.requestUpdate();
      }
    });

    this._bindEvent();
  }

  override render() {
    const { gfx, connector } = this;
    // path is relative to the element's xywh
    const { path, mode } = connector;
    const zoom = gfx.viewport.zoom;
    const startPoint = Vec.subScalar(Vec.mul(path[0], zoom), HALF_SIZE);
    const endPoint = Vec.subScalar(
      Vec.mul(path[path.length - 1], zoom),
      HALF_SIZE
    );
    const startStyle = {
      transform: `translate3d(${startPoint[0]}px,${startPoint[1]}px,0)`,
    };
    const endStyle = {
      transform: `translate3d(${endPoint[0]}px,${endPoint[1]}px,0)`,
    };

    // Parse path into segments for segment handles
    // Only show segment handles for orthogonal (elbow) connectors
    const showSegmentHandles =
      mode === ConnectorMode.Orthogonal || mode === ConnectorMode.Curve;

    let segmentHandles: TemplateResult | typeof nothing = nothing;
    // Show handles for paths with 2+ points (including simple 2-point lines)
    if (showSegmentHandles && path.length >= 2) {
      this._segments = parsePathToSegments(path);

      // Filter to only movable segments (not tails)
      const movableSegments = this._segments.filter(s => s.type === 'movable');

      if (movableSegments.length > 0) {
        segmentHandles = html`${movableSegments.map(segment => {
          const handlePos = Vec.subScalar(
            Vec.mul(segment.midpoint, zoom),
            HALF_SIZE
          );
          const cursor = getCursorForSegment(segment);
          const orientationClass = segment.orientation;

          const handleStyle = {
            transform: `translate3d(${handlePos[0]}px,${handlePos[1]}px,0)`,
            cursor,
          };

          return html`
            <div
              class="line-controller segment-handle ${orientationClass}"
              style=${styleMap(handleStyle)}
              data-segment-index="${segment.index}"
              @pointerdown=${(e: PointerEvent) =>
                this._onSegmentPointerDown(e, segment.index)}
            ></div>
          `;
        })}`;
      }
    }

    return html`
      <div
        class="line-controller line-start"
        style=${styleMap(startStyle)}
      ></div>
      ${segmentHandles}
      <div class="line-controller line-end" style=${styleMap(endStyle)}></div>
    `;
  }

  @query('.line-end')
  private accessor _endHandler!: HTMLDivElement;

  @query('.line-start')
  private accessor _startHandler!: HTMLDivElement;

  @property({ attribute: false })
  accessor connector!: ConnectorElementModel;

  @consume({
    context: storeContext,
  })
  accessor doc!: Store;

  @property({ attribute: false })
  accessor edgeless!: BlockComponent;

  @consume({
    context: stdContext,
  })
  accessor std!: BlockStdScope;
}
