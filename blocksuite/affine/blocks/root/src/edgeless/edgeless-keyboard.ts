import { insertLinkByQuickSearchCommand } from '@blocksuite/affine-block-bookmark';
import { EdgelessTextBlockComponent } from '@blocksuite/affine-block-edgeless-text';
import {
  FrameTool,
  type PresentToolOption,
} from '@blocksuite/affine-block-frame';
import {
  DefaultTool,
  EdgelessCRUDIdentifier,
  EdgelessLegacySlotIdentifier,
  getSurfaceBlock,
  getSurfaceComponent,
  isNoteBlock,
} from '@blocksuite/affine-block-surface';
import { toast } from '@blocksuite/affine-components/toast';
import {
  BrushTool,
  EraserTool,
  HighlighterTool,
} from '@blocksuite/affine-gfx-brush';
import {
  ConnectorPathGenerator,
  ConnectorTool,
  mountConnectorLabelEditor,
} from '@blocksuite/affine-gfx-connector';
import {
  createGroupFromSelectedCommand,
  ungroupCommand,
} from '@blocksuite/affine-gfx-group';
import {
  getNearestTranslation,
  isElementOutsideViewport,
  isSingleMindMapNode,
} from '@blocksuite/affine-gfx-mindmap';
import { NoteTool } from '@blocksuite/affine-gfx-note';
import { PanTool } from '@blocksuite/affine-gfx-pointer';
import { mountShapeTextEditor, ShapeTool } from '@blocksuite/affine-gfx-shape';
import { TextTool } from '@blocksuite/affine-gfx-text';
import {
  ConnectorElementModel,
  type ConnectorMode,
  DefaultTheme,
  EdgelessTextBlockModel,
  getShapeRadius,
  getShapeType,
  GroupElementModel,
  LayoutType,
  MindmapElementModel,
  NoteBlockModel,
  NoteDisplayMode,
  ShapeElementModel,
} from '@blocksuite/affine-model';
import {
  EditPropsStore,
  TelemetryProvider,
} from '@blocksuite/affine-shared/services';
import { matchModels } from '@blocksuite/affine-shared/utils';
import {
  Direction,
  getPosition,
  nextBound as computeNextBound,
} from '@blocksuite/affine-widget-edgeless-selected-rect';
import { IS_MAC } from '@blocksuite/global/env';
import { Bound, getCommonBound } from '@blocksuite/global/gfx';
import { SurfaceSelection, TextSelection } from '@blocksuite/std';
import {
  type BaseTool,
  GfxBlockElementModel,
  GfxControllerIdentifier,
  type GfxModel,
  type GfxPrimitiveElementModel,
  isGfxGroupCompatibleModel,
  type ToolOptions,
  type ToolType,
} from '@blocksuite/std/gfx';
import * as Y from 'yjs';

import { PageKeyboardManager } from '../keyboard/keyboard-manager.js';
import type { EdgelessRootBlockComponent } from './edgeless-root-block.js';
import { ShapePreviewOverlay } from './shape-preview-overlay.js';
import {
  DEFAULT_NOTE_CHILD_FLAVOUR,
  DEFAULT_NOTE_CHILD_TYPE,
  DEFAULT_NOTE_TIP,
} from './utils/consts.js';
import { deleteElements } from './utils/crud.js';
import { isCanvasElement } from './utils/query.js';

export class EdgelessPageKeyboardManager extends PageKeyboardManager {
  private _shapePreviewOverlay: ShapePreviewOverlay | null = null;
  private readonly _previewDirections: Set<Direction> = new Set();
  private _pathGenerator: ConnectorPathGenerator | null = null;
  private _isTraversing = false;

  /**
   * Excalidraw Element Navigation Algorithm Formal Discussion
   *
   * 1. Abstract
   * This document details an algorithm for navigating between elements connected by lines (arrows) in an Excalidraw canvas using `Alt/Option + Arrow keys`. The algorithm is essentially a stateful graph traversal algorithm where canvas elements are nodes (Node) and connecting lines are edges (Edge). The goal of the algorithm is to intuitively select the next element visually and logically based on the user's directional input.
   *
   * 2. Core Concepts and Data Structure Definitions
   * To implement this algorithm, we need to define the following core data structures:
   *
   * 2.1. Element
   * The basic object on the canvas.
   * - `Element`:
   *   - `id`: `String` (unique identifier)
   *   - `x`: `Number` (top-left x-coordinate)
   *   - `y`: `Number` (top-left y-coordinate)
   *   - `width`: `Number` (width)
   *   - `height`: `Number` (height)
   *
   * 2.2. Node
   * Elements that can be connected, which are vertices in the graph. In Excalidraw, this corresponds to `ExcalidrawBindableElement`.
   * - `Node` ⊂ `Element`
   *
   * 2.3. Edge
   * A directed line segment used to connect two `Node`s (e.g., an arrow). In Excalidraw, this corresponds to `ExcalidrawLinearElement`.
   * - `Edge` ⊂ `Element`:
   *   - `startBinding`: `Object | null`
   *     - `elementId`: `Node.id` (ID of the starting node)
   *   - `endBinding`: `Object | null`
   *     - `elementId`: `Node.id` (ID of the ending node)
   *   - `points`: `Array<[Number, Number]>` (sequence of point coordinates defining the edge shape)
   *
   * 2.4. Canvas
   * A collection of all elements.
   * - `C`: An instance of `Map<Element.id, Element>` for efficient lookup.
   *
   * 2.5. Navigator State
   * The navigator must maintain an internal state to handle multiple consecutive navigation operations.
   * - `NavigatorState`:
   *   - `isExploring`: `Boolean` (whether the navigation session is active)
   *   - `visitedNodes`: `Set<Node.id>` (set of IDs of visited nodes in the current session, used to prevent cycles)
   *   - `lastDirection`: `Direction | null` (the direction of the last navigation)
   *   - `siblingNodes`: `Array<Node>` (stores "sibling" nodes when there are multiple successors in the same direction)
   *   - `siblingIndex`: `Integer` (current index in the `siblingNodes` list)
   *
   * 2.6. Direction
   * An enum type representing the user's navigation intent.
   * - `D` = `{ UP, DOWN, LEFT, RIGHT }`
   *
   * 3. Core Geometric Calculation: Connection Heading
   * To determine which direction an edge "comes out of" a node, we need to calculate its "connection heading".
   *
   * **Definition:** `getHeading(N, P_conn)`
   * This function takes a node `N` and a connection point `P_conn` (the position of the edge's endpoint in world coordinates), and returns a `Direction`.
   *
   * 1.  **Get the Node's Axis-Aligned Bounding Box (AABB)**:
   *     - `B(N) = { x_min, y_min, x_max, y_max }`
   *     - `x_min = N.x`
   *     - `y_min = N.y`
   *     - `x_max = N.x + N.width`
   *     - `y_max = N.y + N.height`
   *
   * 2.  **Calculate the Midpoints of the Four Sides**:
   *     - `P_up = ((x_min + x_max)/2, y_min)`
   *     - `P_down = ((x_min + x_max)/2, y_max)`
   *     - `P_left = (x_min, (y_min + y_max)/2)`
   *     - `P_right = (x_max, (y_min + y_max)/2)`
   *
   * 3.  **Calculate Distances**:
   *     - Calculate the Euclidean distance from `P_conn` to `P_up`, `P_down`, `P_left`, `P_right`.
   *     - `dist_side = distance(P_conn, P_side)`
   *
   * 4.  **Determine Heading**:
   *     - `getHeading` returns the `Direction` corresponding to `min(dist_up, dist_down, dist_left, dist_right)`.
   *
   * 4. Key Functions
   *
   * 4.1. `getSuccessors(N, D, C)`
   * This function finds all direct successor nodes of node `N` in direction `D`.
   *
   * **Algorithm**:
   * 1.  Initialize an empty list `Result = []`.
   * 2.  Iterate through all `Edge` elements `e` in Canvas `C`.
   * 3.  **Filter Starting Node**:
   *     - If `e.startBinding.elementId` equals `N.id` and `e.endBinding` exists, then `e` is an edge starting from `N`.
   *     - Let `SuccessorNode = C.get(e.endBinding.elementId)`.
   * 4.  **Calculate Connection Point**:
   *     - Get the endpoint of `e` that connects to `N`. For `getSuccessors`, this is the first point of `e`.
   *     - `P_start_local = e.points[0]`
   *     - `P_conn = (e.x + P_start_local[0], e.y + P_start_local[1])`
   * 5.  **Filter by Direction**:
   *     - `heading = getHeading(N, P_conn)`
   *     - If `heading` equals `D`, add `SuccessorNode` to the `Result` list.
   * 6.  Return `Result`.
   *
   * 4.2. `getPredecessors(N, D, C)`
   * This function finds all direct predecessor nodes of node `N` in direction `D` (i.e., nodes with arrows pointing to `N`). Its logic is similar to `getSuccessors`, but roles are swapped.
   *
   * **Algorithm**:
   * 1.  Initialize an empty list `Result = []`.
   * 2.  Iterate through all `Edge` elements `e` in `C`.
   * 3.  **Filter Ending Node**:
   *     - If `e.endBinding.elementId` equals `N.id` and `e.startBinding` exists, then `e` is an edge pointing to `N`.
   *     - Let `PredecessorNode = C.get(e.startBinding.elementId)`.
   * 4.  **Calculate Connection Point**:
   *     - Get the endpoint of `e` that connects to `N`. For `getPredecessors`, this is the last point of `e`.
   *     - `P_end_local = e.points[e.points.length - 1]`
   *     - `P_conn = (e.x + P_end_local[0], e.y + P_end_local[1])`
   * 5.  **Filter by Direction**:
   *     - `heading = getHeading(N, P_conn)`
   *     - If `heading` equals `D`, add `PredecessorNode` to the `Result` list.
   * 6.  Return `Result`.
   *
   * 5. Main Navigation Algorithm `navigate(CurrentNode, D, C)`
   * This is the core entry point of the navigator, which relies on and maintains `NavigatorState`.
   *
   * **Input**:
   * - `CurrentNode`: `Node | null` - The currently selected node.
   * - `D`: `Direction` - The user-requested navigation direction.
   * - `C`: `Canvas` - All canvas elements.
   *
   * **Output**:
   * - `Node.id | null` - The ID of the next node to be selected, or `null` if nowhere to go.
   *
   * **Algorithm Steps**:
   *
   * 1.  **[Initialization]** If `CurrentNode` is `null`:
   *     a. Find a default node in `C` (e.g., the first `Node` type element).
   *     b. If found, set `isExploring = true`, add its ID to `visitedNodes`, and return its ID.
   *     c. If not found, return `null`.
   *
   * 2.  **[Session Start]** If `isExploring` is `false`:
   *     a. Set `isExploring = true`.
   *     b. Add `CurrentNode.id` to `visitedNodes`.
   *
   * 3.  **[Direction Check]** If `D` is not equal to `lastDirection`:
   *     a. Update `lastDirection = D`.
   *     b. Reset sibling node list: `siblingNodes = []`, `siblingIndex = 0`.
   *     c. **Otherwise (direction unchanged)**:
   *         i. If `siblingNodes` is not empty:
   *            - `siblingIndex++`.
   *            - If `siblingNodes[siblingIndex]` exists, let `NextNode = siblingNodes[siblingIndex]`.
   *            - Add `NextNode.id` to `visitedNodes` and return `NextNode.id`.
   *
   * 4.  **[Find Successors]** Call `Successors = getSuccessors(CurrentNode, D, C)`.
   *
   * 5.  **[Handle Successors]** If `Successors` list is not empty:
   *     a. **Single Successor**: If `Successors.length === 1`:
   *         - `NextNode = Successors[0]`.
   *         - If `NextNode.id` is not in `visitedNodes`, add it and return its ID. Otherwise, to prevent cycles, return `null`.
   *         - Reset `siblingNodes = []` and `siblingIndex = 0`.
   *     b. **Multiple Successors**: If `Successors.length > 1`:
   *         - Sort the `Successors` list by direction:
   *           - If `D` is `LEFT` or `RIGHT`, sort by `y` coordinate in ascending order.
   *           - If `D` is `UP` or `DOWN`, sort by `x` coordinate in ascending order.
   *         - Store the sorted list in `siblingNodes`.
   *         - `siblingIndex = 0`.
   *         - `NextNode = siblingNodes[0]`.
   *         - If `NextNode.id` is not in `visitedNodes`, add it and return its ID. Otherwise return `null`.
   *
   * 6.  **[Fallback to Predecessors]** If `Successors` list is empty:
   *     a. Call `Predecessors = getPredecessors(CurrentNode, D, C)`.
   *     b. If `Predecessors` list is not empty, return `Predecessors[0].id`. (Here, `visitedNodes` is usually not checked, as it's a fallback).
   *
   * 7.  **[Nowhere to Go]** If none of the above steps find the next node, return `null`.
   */
  private readonly _navigatorState = {
    isExploring: false,
    visitedNodes: new Set<string>(),
    lastDirection: null as Direction | null,
    siblingNodes: [] as GfxModel[],
    siblingIndex: 0,
  };

  get gfx() {
    return this.std.get(GfxControllerIdentifier);
  }

  get slots() {
    return this.std.get(EdgelessLegacySlotIdentifier);
  }

  get std() {
    return this.rootComponent.std;
  }

  constructor(override rootComponent: EdgelessRootBlockComponent) {
    super(rootComponent);
    this._initShapePreviewOverlay();
    this._bindSelectionChange();
    this.rootComponent.bindHotKey(
      {
        v: () => {
          this._setEdgelessTool(DefaultTool);
        },
        t: () => {
          this._setEdgelessTool(TextTool);
        },
        c: () => {
          const editPropsStore = this.std.get(EditPropsStore);

          let mode: ConnectorMode;
          if (
            this.gfx.tool.currentToolName$.peek() === ConnectorTool.toolName
          ) {
            mode = this.gfx.tool.get(ConnectorTool).getNextMode();
            editPropsStore.recordLastProps('connector', { mode });
          } else {
            mode = editPropsStore.lastProps$.peek().connector.mode;
          }

          this._setEdgelessTool(ConnectorTool, { mode });
        },
        h: () => {
          this._setEdgelessTool(PanTool, {
            panning: false,
          });
        },
        n: () => {
          this._setEdgelessTool(NoteTool, {
            childFlavour: DEFAULT_NOTE_CHILD_FLAVOUR,
            childType: DEFAULT_NOTE_CHILD_TYPE,
            tip: DEFAULT_NOTE_TIP,
          });
        },
        p: () => {
          this._setEdgelessTool(BrushTool);
        },
        'Shift-p': () => {
          this._setEdgelessTool(HighlighterTool);
        },
        e: () => {
          this._setEdgelessTool(EraserTool);
        },
        k: () => {
          if (this.rootComponent.service.locked) return;
          const { selection } = rootComponent.service;

          if (
            selection.selectedElements.length === 1 &&
            selection.firstElement instanceof GfxBlockElementModel &&
            matchModels(selection.firstElement as GfxBlockElementModel, [
              NoteBlockModel,
            ])
          ) {
            this.slots.toggleNoteSlicer.next();
          }
        },
        f: () => {
          if (this.rootComponent.service.locked) return;
          if (
            this.rootComponent.service.selection.selectedElements.length !==
              0 &&
            !this.rootComponent.service.selection.editing
          ) {
            const frame = rootComponent.service.frame.createFrameOnSelected();
            if (!frame) return;
            this.rootComponent.std
              .getOptional(TelemetryProvider)
              ?.track('CanvasElementAdded', {
                control: 'shortcut',
                page: 'whiteboard editor',
                module: 'toolbar',
                segment: 'toolbar',
                type: 'frame',
              });
            rootComponent.surface.fitToViewport(Bound.deserialize(frame.xywh));
          } else if (!this.rootComponent.service.selection.editing) {
            this._setEdgelessTool(FrameTool);
          }
        },
        '-': () => {
          if (this.rootComponent.service.locked) return;
          const { selectedElements: elements } =
            rootComponent.service.selection;
          if (
            !rootComponent.service.selection.editing &&
            elements.length === 1 &&
            isNoteBlock(elements[0])
          ) {
            this.slots.toggleNoteSlicer.next();
          }
        },
        '@': () => {
          const std = this.rootComponent.std;
          if (
            std.selection.getGroup('note').length > 0 ||
            std.selection.find(TextSelection) ||
            Boolean(std.selection.find(SurfaceSelection)?.editing)
          ) {
            return;
          }
          const [_, { insertedLinkType }] = std.command.exec(
            insertLinkByQuickSearchCommand
          );

          insertedLinkType
            ?.then(type => {
              const flavour = type?.flavour;
              if (!flavour) return;

              rootComponent.std
                .getOptional(TelemetryProvider)
                ?.track('CanvasElementAdded', {
                  control: 'shortcut',
                  page: 'whiteboard editor',
                  module: 'toolbar',
                  segment: 'toolbar',
                  type: flavour.split(':')[1],
                });
            })
            .catch(console.error);
        },
        'Shift-s': () => {
          if (this.rootComponent.service.locked) return;
          const controller = rootComponent.gfx.tool.currentTool$.peek();
          if (
            this.rootComponent.service.selection.editing ||
            !(controller instanceof ShapeTool)
          ) {
            return;
          }
          this._setEdgelessTool(ShapeTool, {
            shapeName: controller.cycleShapeName('prev'),
          });

          controller.createOverlay();
        },
        'Mod-g': ctx => {
          if (this.rootComponent.service.locked) return;
          if (
            this.rootComponent.service.selection.selectedElements.length > 1 &&
            !this.rootComponent.service.selection.editing
          ) {
            ctx.get('keyboardState').event.preventDefault();
            rootComponent.std.command.exec(createGroupFromSelectedCommand);
          }
        },
        'Shift-Mod-g': ctx => {
          if (this.rootComponent.service.locked) return;
          const { selection } = this.rootComponent.service;
          if (
            selection.selectedElements.length === 1 &&
            selection.firstElement instanceof GroupElementModel &&
            !selection.firstElement.isLocked()
          ) {
            ctx.get('keyboardState').event.preventDefault();
            rootComponent.std.command.exec(ungroupCommand, {
              group: selection.firstElement,
            });
          }
        },
        'Mod-a': ctx => {
          if (this.rootComponent.service.locked) return;
          if (this.rootComponent.service.selection.editing) {
            return;
          }

          ctx.get('defaultState').event.preventDefault();
          const { service } = this.rootComponent;
          this.rootComponent.service.selection.set({
            elements: [
              ...service.blocks
                .filter(
                  block =>
                    block.group === null &&
                    !(
                      matchModels(block, [NoteBlockModel]) &&
                      block.props.displayMode === NoteDisplayMode.DocOnly
                    )
                )
                .map(block => block.id),
              ...service.elements
                .filter(el => el.group === null)
                .map(el => el.id),
            ],
            editing: false,
          });
        },
        'Mod--': ctx => {
          ctx.get('defaultState').event.preventDefault();
          this.rootComponent.service.setZoomByAction('out');
        },
        'Alt-0': ctx => {
          ctx.get('defaultState').event.preventDefault();
          this.rootComponent.service.setZoomByAction('reset');
        },
        'Alt-1': ctx => {
          ctx.get('defaultState').event.preventDefault();
          this.rootComponent.service.setZoomByAction('fit');
        },
        'Alt-2': ctx => {
          ctx.get('defaultState').event.preventDefault();

          const selectedElements = this.gfx.selection.selectedElements;

          if (selectedElements.length === 0) {
            return;
          }

          const bound = getCommonBound(selectedElements);
          if (bound === null) {
            return;
          }

          toast(this.rootComponent.host, 'Zoom to selection');

          this.gfx.viewport.setViewportByBound(
            bound,
            [0.12, 0.12, 0.12, 0.12],
            true
          );
        },
        'Mod-=': ctx => {
          ctx.get('defaultState').event.preventDefault();
          this.rootComponent.service.setZoomByAction('in');
        },
        Backspace: () => {
          this._delete();
        },
        Delete: () => {
          this._delete();
        },
        'Control-d': () => {
          if (!IS_MAC) return;
          this._delete();
        },
        Escape: () => {
          if (!this.rootComponent.service.selection.empty) {
            rootComponent.selection.clear();
          }
        },

        ArrowUp: () => {
          this._move('ArrowUp');
        },

        ArrowDown: () => {
          this._move('ArrowDown');
        },

        ArrowLeft: () => {
          this._move('ArrowLeft');
        },

        ArrowRight: () => {
          this._move('ArrowRight');
        },

        'Shift-ArrowUp': () => {
          this._move('ArrowUp', true);
        },

        'Shift-ArrowDown': () => {
          this._move('ArrowDown', true);
        },

        'Shift-ArrowLeft': () => {
          this._move('ArrowLeft', true);
        },

        'Shift-ArrowRight': () => {
          this._move('ArrowRight', true);
        },

        Enter: ctx => {
          const { service } = rootComponent;
          const selection = service.selection;
          const elements = selection.selectedElements;
          const onlyOne = elements.length === 1;

          if (onlyOne) {
            const element = elements[0];
            const id = element.id;

            if (element.isLocked()) return;

            if (element instanceof ConnectorElementModel) {
              selection.set({
                elements: [id],
                editing: true,
              });
              requestAnimationFrame(() => {
                mountConnectorLabelEditor(element, rootComponent);
              });
              return;
            }

            if (element instanceof EdgelessTextBlockModel) {
              selection.set({
                elements: [id],
                editing: true,
              });
              const textBlock = rootComponent.host.view.getBlock(id);
              if (textBlock instanceof EdgelessTextBlockComponent) {
                textBlock.tryFocusEnd();
              }

              return;
            }

            if (element instanceof ShapeElementModel && !selection.editing) {
              ctx.get('keyboardState').event.preventDefault();
              mountShapeTextEditor(element, rootComponent);
              return;
            }
          }

          if (!isSingleMindMapNode(elements)) {
            return;
          }

          const mindmap = elements[0].group as MindmapElementModel;
          const currentNode = mindmap.getNode(elements[0].id)!;
          const node = mindmap.getNode(elements[0].id)!;
          const parent = mindmap.getParentNode(node.id) ?? node;
          const id = mindmap.addNode(parent.id, currentNode.id, 'after');
          const target = service.crud.getElementById(id) as ShapeElementModel;

          requestAnimationFrame(() => {
            mountShapeTextEditor(target, rootComponent);

            if (isElementOutsideViewport(service.viewport, target, [20, 20])) {
              const { elementBound } = target;

              service.viewport.smoothTranslate(
                elementBound.x + elementBound.w / 2,
                elementBound.y + elementBound.h / 2
              );
            }
          });
        },
        Tab: ctx => {
          ctx.get('defaultState').event.preventDefault();

          const { service } = rootComponent;
          const selection = service.selection;
          const elements = selection.selectedElements;

          if (
            elements.length === 1 &&
            elements[0] instanceof ShapeElementModel &&
            !selection.editing
          ) {
            const shapeElement = elements[0];

            if (shapeElement.isLocked()) return;

            const shapeTool = this.gfx.tool.get(ShapeTool);
            const nextShapeName = shapeTool.cycleShapeName('next');

            const shapeType = getShapeType(nextShapeName);
            const radius = getShapeRadius(nextShapeName);

            rootComponent.std.store.captureSync();
            rootComponent.std
              .get(EdgelessCRUDIdentifier)
              .updateElement(shapeElement.id, {
                shapeType,
                radius,
              });

            // Update the activated option of ShapeTool so that the next Tab key press cycles from the current shape
            shapeTool.activatedOption.shapeName = nextShapeName;

            // Keep the element selected, which will automatically trigger the floating toolbar to show
            requestAnimationFrame(() => {
              // Ensure the element remains selected
              selection.set({
                elements: [shapeElement.id],
                editing: false,
              });

              // Trigger the shape switch menu in the floating toolbar to show
              requestAnimationFrame(() => {
                // Find the floating toolbar
                const toolbarWidget = rootComponent.querySelector(
                  'affine-toolbar-widget'
                );
                if (toolbarWidget) {
                  // Find the shape switch menu button
                  const shapeMenuButton =
                    toolbarWidget.shadowRoot?.querySelector(
                      'editor-menu-button[aria-label="switch shape type-menu"]'
                    );
                  if (
                    shapeMenuButton &&
                    typeof (shapeMenuButton as any).show === 'function'
                  ) {
                    (shapeMenuButton as any).show();
                  }
                }
              });
            });

            return;
          }

          if (!isSingleMindMapNode(elements)) {
            return;
          }

          const mindmap = elements[0].group as MindmapElementModel;
          if (mindmap.isLocked()) return;

          const node = mindmap.getNode(elements[0].id)!;
          const id = mindmap.addNode(node.id);
          const target = service.crud.getElementById(id) as ShapeElementModel;

          if (node.detail.collapsed) {
            mindmap.toggleCollapse(node, { layout: true });
          }

          requestAnimationFrame(() => {
            mountShapeTextEditor(target, rootComponent);

            if (isElementOutsideViewport(service.viewport, target, [20, 20])) {
              const { elementBound } = target;

              service.viewport.smoothTranslate(
                elementBound.x + elementBound.w / 2,
                elementBound.y + elementBound.h / 2
              );
            }
          });
        },
      },
      {
        global: true,
      }
    );

    this._bindToggleHand();
  }

  private _bindToggleHand() {
    this.rootComponent.handleEvent(
      'keyDown',
      ctx => {
        const event = ctx.get('keyboardState').raw;
        const gfx = this.rootComponent.gfx;
        const selection = gfx.selection;

        // Handle Alt/Option + Arrow keys for graph traversal
        if (
          event.altKey &&
          (event.code === 'ArrowUp' ||
            event.code === 'ArrowDown' ||
            event.code === 'ArrowLeft' ||
            event.code === 'ArrowRight') &&
          !event.repeat
        ) {
          if (this._canTraverseGraph()) {
            event.preventDefault();

            let direction: Direction;
            switch (event.code) {
              case 'ArrowUp':
                direction = Direction.Top;
                break;
              case 'ArrowDown':
                direction = Direction.Bottom;
                break;
              case 'ArrowLeft':
                direction = Direction.Left;
                break;
              case 'ArrowRight':
                direction = Direction.Right;
                break;
              default:
                return false;
            }
            this._traverseGraph(direction);
            return true;
          }
        }
        // Handle Cmd/Ctrl + Arrow keys for shape preview
        else if (
          (event.metaKey || event.ctrlKey) &&
          (event.code === 'ArrowUp' ||
            event.code === 'ArrowDown' ||
            event.code === 'ArrowLeft' ||
            event.code === 'ArrowRight') &&
          !event.repeat
        ) {
          if (this._canShowShapePreview()) {
            event.preventDefault();

            let direction: Direction;
            switch (event.code) {
              case 'ArrowUp':
                direction = Direction.Top;
                break;
              case 'ArrowDown':
                direction = Direction.Bottom;
                break;
              case 'ArrowLeft':
                direction = Direction.Left;
                break;
              case 'ArrowRight':
                direction = Direction.Right;
                break;
              default:
                return false;
            }
            this._showShapePreview(direction);
            return true;
          }
        } else if (event.code === 'Space' && !event.repeat) {
          const currentToolName =
            this.rootComponent.gfx.tool.currentToolName$.peek();
          if (currentToolName === 'frameNavigator') return false;
          this._space(event);
        } else if (
          !selection.editing &&
          // the key might be `Unidentified` according to mdn
          event.key?.length === 1 &&
          !event.shiftKey &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.metaKey
        ) {
          const elements = selection.selectedElements;
          const doc = this.rootComponent.store;

          if (isSingleMindMapNode(elements)) {
            const target = gfx.getElementById(
              elements[0].id
            ) as ShapeElementModel;
            if (target.text) {
              doc.transact(() => {
                target.text!.delete(0, target.text!.length);
                target.text!.insert(0, event.key);
              });
            }
            mountShapeTextEditor(target, this.rootComponent);
            return true;
          }
        }

        return false;
      },
      { global: true }
    );
    this.rootComponent.handleEvent(
      'keyUp',
      ctx => {
        const event = ctx.get('keyboardState').raw;

        // Handle Cmd/Ctrl key release to create shapes from previews
        if (
          (event.code === 'MetaLeft' ||
            event.code === 'MetaRight' ||
            event.code === 'ControlLeft' ||
            event.code === 'ControlRight') &&
          this._previewDirections.size > 0
        ) {
          this._createShapesFromPreviews();
          return true;
        } else if (event.code === 'Space' && !event.repeat) {
          const currentToolName =
            this.rootComponent.gfx.tool.currentToolName$.peek();
          if (currentToolName === 'frameNavigator') return false;
          this._space(event);
        }
        return false;
      },
      { global: true }
    );
  }

  private _delete() {
    const edgeless = this.rootComponent;

    if (edgeless.service.locked) return;
    if (edgeless.service.selection.editing) {
      return;
    }

    const selectedElements = edgeless.service.selection.selectedElements;
    if (selectedElements.some(e => e.isLocked())) return;

    if (isSingleMindMapNode(selectedElements)) {
      const node = selectedElements[0];
      const mindmap = node.group as MindmapElementModel;
      const focusNode =
        mindmap.getSiblingNode(node.id, 'prev') ??
        mindmap.getSiblingNode(node.id, 'next') ??
        mindmap.getParentNode(node.id);

      if (focusNode) {
        edgeless.service.selection.set({
          elements: [focusNode.element.id],
          editing: false,
        });
      }

      deleteElements(edgeless, selectedElements);
    } else {
      deleteElements(edgeless, selectedElements);
      edgeless.service.selection.clear();
    }
  }

  private _move(key: string, shift = false) {
    const edgeless = this.rootComponent;

    if (edgeless.service.locked) return;
    if (edgeless.service.selection.editing) return;

    const { selectedElements } = edgeless.service.selection;
    const inc = shift ? 10 : 1;
    const mindmapNodes = selectedElements.filter(
      el => el.group instanceof MindmapElementModel
    );

    if (mindmapNodes.length > 0) {
      const node = mindmapNodes[0];
      const mindmap = node.group as MindmapElementModel;
      const nodeDirection = mindmap.getLayoutDir(node.id);
      let targetNode: GfxPrimitiveElementModel | null = null;

      switch (key) {
        case 'ArrowUp':
        case 'ArrowDown':
          targetNode =
            mindmap.getSiblingNode(
              node.id,
              key === 'ArrowDown' ? 'next' : 'prev',
              nodeDirection === LayoutType.RIGHT
                ? 'right'
                : nodeDirection === LayoutType.LEFT
                  ? 'left'
                  : undefined
            )?.element ?? null;
          break;
        case 'ArrowLeft':
          targetNode =
            nodeDirection === LayoutType.RIGHT
              ? (mindmap.getParentNode(node.id)?.element ?? null)
              : (mindmap.getChildNodes(node.id, 'left')[0]?.element ?? null);

          break;
        case 'ArrowRight':
          targetNode =
            nodeDirection === LayoutType.RIGHT ||
            nodeDirection === LayoutType.BALANCE
              ? (mindmap.getChildNodes(node.id, 'right')[0]?.element ?? null)
              : (mindmap.getParentNode(node.id)?.element ?? null);
          break;
      }

      if (targetNode) {
        edgeless.service.selection.set({
          elements: [targetNode.id],
          editing: false,
        });

        if (
          isElementOutsideViewport(
            edgeless.service.viewport,
            targetNode,
            [90, 20]
          )
        ) {
          const [dx, dy] = getNearestTranslation(
            edgeless.service.viewport,
            targetNode,
            [100, 20]
          );

          edgeless.service.viewport.smoothTranslate(
            edgeless.service.viewport.centerX - dx,
            edgeless.service.viewport.centerY + dy
          );
        }
      }

      return;
    }

    if (selectedElements.some(e => e.isLocked())) return;

    const movedElements = new Set([
      ...selectedElements,
      ...selectedElements
        .map(el => (isGfxGroupCompatibleModel(el) ? el.descendantElements : []))
        .flat(),
    ]);

    movedElements.forEach(element => {
      const bound = Bound.deserialize(element.xywh).clone();

      switch (key) {
        case 'ArrowUp':
          bound.y -= inc;
          break;
        case 'ArrowLeft':
          bound.x -= inc;
          break;
        case 'ArrowRight':
          bound.x += inc;
          break;
        case 'ArrowDown':
          bound.y += inc;
          break;
      }

      if (isCanvasElement(element)) {
        if (element instanceof ConnectorElementModel) {
          element.moveTo(bound);
        }
        element['xywh'] = bound.serialize();
      } else {
        element['xywh'] = bound.serialize();
      }
    });
  }

  private _setEdgelessTool<T extends BaseTool>(
    toolType: ToolType<T>,
    ...options: [options?: ToolOptions<T>, ignoreActiveState?: boolean]
  ) {
    const ignoreActiveState =
      typeof options === 'boolean'
        ? options[0]
        : options[1] === undefined
          ? false
          : options[1];

    // when editing, should not update mouse mode by shortcut
    if (!ignoreActiveState && this.rootComponent.gfx.selection.editing) {
      return;
    }

    this.rootComponent.gfx.tool.setTool(
      toolType,
      options[0] !== undefined && typeof options[0] !== 'boolean'
        ? options[0]
        : undefined
    );
  }

  private _space(event: KeyboardEvent) {
    /*
    Call this function with a check for !event.repeat to consider only the first keydown (not repeat). This way, you can use onPressSpaceBar in a tool to determine if the space bar is pressed or not.
  */

    const edgeless = this.rootComponent;
    const selection = edgeless.service.selection;
    const currentTool = edgeless.gfx.tool.currentTool$.peek()!;
    const currentSel = selection.surfaceSelections;
    const isKeyDown = event.type === 'keydown';

    if (edgeless.gfx.tool.dragging$.peek()) {
      return; // Don't do anything if currently dragging
    }

    const revertToPrevTool = (ev: KeyboardEvent) => {
      if (ev.code === 'Space') {
        const toolConstructor = currentTool.constructor as typeof DefaultTool;
        let finalOptions = currentTool?.activatedOption;

        // Handle frameNavigator (PresentTool) restoration after space pan
        if (currentTool.toolName === 'frameNavigator') {
          finalOptions = {
            ...currentTool?.activatedOption,
            restoredAfterPan: true,
          } as PresentToolOption;
        }

        this._setEdgelessTool(toolConstructor, finalOptions);
        selection.set(currentSel);
        document.removeEventListener('keyup', revertToPrevTool, false);
      }
    };

    if (isKeyDown) {
      if (
        currentTool.toolName === 'pan' ||
        (currentTool.toolName === 'default' && selection.editing)
      ) {
        return;
      }

      // If in presentation mode, disable black background during space drag
      if (currentTool.toolName === 'frameNavigator') {
        this.slots.navigatorSettingUpdated.next({
          blackBackground: false,
        });
      }

      this._setEdgelessTool(PanTool, { panning: false });

      this.std.event.disposables.addFromEvent(
        document,
        'keyup',
        revertToPrevTool
      );
    }
  }

  /**
   * Initialize the shape preview overlay
   */
  private _initShapePreviewOverlay() {
    this._shapePreviewOverlay = new ShapePreviewOverlay(this.gfx);
    this._pathGenerator = new ConnectorPathGenerator({
      getElementById: id => this.gfx.getElementById(id),
    });

    const surface = getSurfaceComponent(this.std);
    if (surface) {
      surface.renderer.addOverlay(this._shapePreviewOverlay);
    } else {
      // Try again after a short delay
      setTimeout(() => {
        const surface = getSurfaceComponent(this.std);
        if (surface && this._shapePreviewOverlay) {
          surface.renderer.addOverlay(this._shapePreviewOverlay);
        }
      }, 100);
    }
  }

  /**
   * Bind selection change events to clear previews when selection changes
   */
  private _bindSelectionChange() {
    this.gfx.selection.slots.updated.subscribe(() => {
      // Clear previews when selection changes
      this._clearAllShapePreviews();
      if (!this._isTraversing) {
        this._resetNavigatorState();
      }
    });
  }

  /**
   * Check if the current selection is a single shape that can show preview
   */
  private _canShowShapePreview(): boolean {
    const { selectedElements } = this.rootComponent.service.selection;
    return (
      selectedElements.length === 1 &&
      selectedElements[0] instanceof ShapeElementModel &&
      !selectedElements[0].isLocked() &&
      !this.rootComponent.service.selection.editing
    );
  }

  /**
   * Get the stroke color for preview shapes
   */
  private _getPreviewStrokeColor(shape: ShapeElementModel): string {
    const surface = getSurfaceComponent(this.std);
    if (!surface) return '#000000';

    const colorValue = surface.renderer.getColorValue(
      shape.strokeColor,
      DefaultTheme.shapeStrokeColor,
      true
    );

    // Ensure we return a string color value
    if (typeof colorValue === 'string') {
      return colorValue;
    } else if (typeof colorValue === 'object' && colorValue !== null) {
      const colorObj = colorValue as any;
      if ('normal' in colorObj) {
        return colorObj.normal;
      } else if ('light' in colorObj) {
        return colorObj.light;
      }
    }

    return '#000000';
  }

  /**
   * Compute the next bound for a shape in the given direction
   */
  private _computeNextBound(shape: ShapeElementModel, direction: Direction) {
    const surfaceBlock = getSurfaceBlock(this.std.store);
    if (!surfaceBlock) {
      return null;
    }

    const connectedShapes = surfaceBlock
      .getConnectors(shape.id)
      .reduce((prev, current) => {
        if (current.target.id === shape.id && current.source.id) {
          const sourceElement = this.gfx.getElementById(current.source.id);
          if (sourceElement instanceof ShapeElementModel) {
            prev.push(sourceElement);
          }
        }
        if (current.source.id === shape.id && current.target.id) {
          const targetElement = this.gfx.getElementById(current.target.id);
          if (targetElement instanceof ShapeElementModel) {
            prev.push(targetElement);
          }
        }
        return prev;
      }, [] as ShapeElementModel[]);

    return computeNextBound(direction, shape, connectedShapes);
  }

  /**
   * Show preview shape in the specified direction
   */
  private _showShapePreview(direction: Direction) {
    if (
      !this._canShowShapePreview() ||
      !this._shapePreviewOverlay ||
      !this._pathGenerator
    ) {
      return;
    }

    // Clear all existing previews before showing new one
    // This ensures only one direction preview is shown at a time
    this._clearAllShapePreviews();

    const shape = this.rootComponent.service.selection
      .selectedElements[0] as ShapeElementModel;
    const nextBound = this._computeNextBound(shape, direction);

    if (!nextBound) {
      return;
    }

    const strokeColor = this._getPreviewStrokeColor(shape);

    // Calculate connector path
    const { startPosition, endPosition } = getPosition(direction);
    const startBound = shape.elementBound;
    const startPoint = shape.getRelativePointLocation(startPosition);

    // Create a temporary shape object for calculating end point
    const tempShape = {
      xywh: nextBound.serialize(),
      rotate: shape.rotate,
      shapeType: shape.shapeType,
    };
    const endPoint = shape.getRelativePointLocation.call(
      tempShape,
      endPosition
    );

    const connectorPath = this._pathGenerator.generateOrthogonalConnectorPath({
      startBound,
      endBound: nextBound,
      startPoint,
      endPoint,
    });

    this._shapePreviewOverlay.addPreviewShape(
      direction,
      nextBound,
      shape.shapeType,
      strokeColor,
      connectorPath,
      startBound
    );

    this._previewDirections.add(direction);
  }

  private _clearAllShapePreviews() {
    if (!this._shapePreviewOverlay) return;

    this._shapePreviewOverlay.clearAllPreviews();
    this._previewDirections.clear();
  }

  /**
   * Create actual shapes based on current previews and clear previews
   */
  private _createShapesFromPreviews() {
    if (
      !this._canShowShapePreview() ||
      !this._shapePreviewOverlay ||
      this._previewDirections.size === 0
    ) {
      return;
    }

    const shape = this.rootComponent.service.selection
      .selectedElements[0] as ShapeElementModel;
    const crud = this.std.get(EdgelessCRUDIdentifier);
    const createdIds: string[] = [];

    // Create shapes for each preview direction (should be only one now)
    this._previewDirections.forEach(direction => {
      const nextBound = this._computeNextBound(shape, direction);
      if (!nextBound) return;

      // Create new shape
      const id = crud.addElement(shape.type, {
        ...shape.serialize(),
        text: new Y.Text(),
        xywh: nextBound.serialize(),
      });

      if (id) {
        createdIds.push(id);

        // Create connector between original and new shape
        const { startPosition, endPosition } = getPosition(direction);
        crud.addElement('connector', {
          mode: 1, // ConnectorMode.Orthogonal (Elbowed)
          strokeWidth: 2,
          stroke: shape.strokeColor,
          source: {
            id: shape.id,
            position: startPosition,
          },
          target: {
            id,
            position: endPosition,
          },
        });
      }
    });

    // Clear previews
    this._clearAllShapePreviews();

    // Select the newly created shape (should be only one)
    if (createdIds.length > 0) {
      this.rootComponent.service.selection.set({
        elements: createdIds,
        editing: false,
      });
    }
  }

  /**
   * Check if graph traversal is possible
   */
  private _canTraverseGraph(): boolean {
    const { selectedElements } = this.rootComponent.service.selection;
    return (
      selectedElements.length === 1 &&
      !selectedElements[0].isLocked() &&
      !this.rootComponent.service.selection.editing
    );
  }

  /**
   * Traverse the graph in the specified direction
   */
  private _traverseGraph(direction: Direction) {
    if (!this._canTraverseGraph()) {
      return;
    }

    const state = this._navigatorState;
    const selection = this.rootComponent.service.selection;
    const currentElement = selection.selectedElements[0];

    // Session Start
    if (!state.isExploring) {
      state.isExploring = true;
      state.visitedNodes.clear();
      state.visitedNodes.add(currentElement.id);
    }

    // Direction Check & Sibling Cycling
    if (state.lastDirection === direction && state.siblingNodes.length > 1) {
      state.siblingIndex = (state.siblingIndex + 1) % state.siblingNodes.length;
      const nextNode = state.siblingNodes[state.siblingIndex];
      state.visitedNodes.add(nextNode.id);
      this._selectElement(nextNode);
      return;
    }

    // Direction changed, reset sibling state but keep visited nodes
    if (state.lastDirection !== direction) {
      state.lastDirection = direction;
      state.siblingNodes = [];
      state.siblingIndex = 0;
    }

    // Find Successors
    const successors = this._getSuccessors(currentElement, direction);
    const unvisitedSuccessors = successors.filter(
      s => !state.visitedNodes.has(s.id)
    );

    let nextNode: GfxModel | null = null;

    // Handle Successors
    if (unvisitedSuccessors.length > 0) {
      // Single successor
      if (unvisitedSuccessors.length === 1) {
        nextNode = unvisitedSuccessors[0];
        state.siblingNodes = [];
        state.siblingIndex = 0;
      } else {
        // Multiple successors - set up sibling cycling
        state.siblingNodes = unvisitedSuccessors;
        state.siblingIndex = 0;
        nextNode = state.siblingNodes[0];
      }
    } else if (successors.length > 0) {
      // All successors visited, but we have successors - cycle through them
      state.siblingNodes = successors;
      state.siblingIndex = 0;
      nextNode = state.siblingNodes[0];
    } else {
      // No successors, fallback to predecessors
      const predecessors = this._getPredecessors(currentElement, direction);
      if (predecessors.length > 0) {
        nextNode = predecessors[0];
        state.siblingNodes = [];
        state.siblingIndex = 0;
      }
    }

    if (nextNode) {
      state.visitedNodes.add(nextNode.id);
      this._selectElement(nextNode);
    }
  }

  private _getSuccessors(element: GfxModel, direction: Direction): GfxModel[] {
    const surfaceBlock = getSurfaceBlock(this.std.store);
    if (!surfaceBlock) return [];

    const connectors = surfaceBlock.getConnectors(element.id);
    const successors: GfxModel[] = [];

    connectors.forEach(connector => {
      if (connector.source.id === element.id && connector.target.id) {
        const heading = this._getHeadingForConnection(
          element,
          connector,
          'source'
        );
        if (heading === direction) {
          const successorElement = this.gfx.getElementById(connector.target.id);
          if (successorElement) {
            successors.push(successorElement as GfxModel);
          }
        }
      }
    });

    if (direction === Direction.Left || direction === Direction.Right) {
      successors.sort((a, b) => a.elementBound.y - b.elementBound.y);
    } else {
      successors.sort((a, b) => a.elementBound.x - b.elementBound.x);
    }

    return successors;
  }

  private _getPredecessors(
    element: GfxModel,
    direction: Direction
  ): GfxModel[] {
    const surfaceBlock = getSurfaceBlock(this.std.store);
    if (!surfaceBlock) return [];

    const connectors = surfaceBlock.getConnectors(element.id);
    const predecessors: GfxModel[] = [];

    connectors.forEach(connector => {
      if (connector.target.id === element.id && connector.source.id) {
        const heading = this._getHeadingForConnection(
          element,
          connector,
          'target'
        );
        if (heading === direction) {
          const predecessorElement = this.gfx.getElementById(
            connector.source.id
          );
          if (predecessorElement) {
            predecessors.push(predecessorElement as GfxModel);
          }
        }
      }
    });

    if (direction === Direction.Left || direction === Direction.Right) {
      predecessors.sort((a, b) => a.elementBound.y - b.elementBound.y);
    } else {
      predecessors.sort((a, b) => a.elementBound.x - b.elementBound.x);
    }

    return predecessors;
  }

  private _getHeadingForConnection(
    element: GfxModel,
    connector: ConnectorElementModel,
    end: 'source' | 'target'
  ): Direction | null {
    if (!connector.path || connector.path.length === 0) {
      return null;
    }

    const P_local =
      end === 'source'
        ? connector.path[0]
        : connector.path[connector.path.length - 1];
    const P_conn = {
      x: connector.elementBound.x + P_local[0],
      y: connector.elementBound.y + P_local[1],
    };

    const N = element.elementBound;
    const P_up = { x: N.x + N.w / 2, y: N.y };
    const P_down = { x: N.x + N.w / 2, y: N.y + N.h };
    const P_left = { x: N.x, y: N.y + N.h / 2 };
    const P_right = { x: N.x + N.w, y: N.y + N.h / 2 };

    const dist = (p1: { x: number; y: number }, p2: { x: number; y: number }) =>
      Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);

    const distances = [
      { dir: Direction.Top, dist: dist(P_conn, P_up) },
      { dir: Direction.Bottom, dist: dist(P_conn, P_down) },
      { dir: Direction.Left, dist: dist(P_conn, P_left) },
      { dir: Direction.Right, dist: dist(P_conn, P_right) },
    ];

    distances.sort((a, b) => a.dist - b.dist);
    return distances[0].dir;
  }

  private _selectElement(element: GfxModel) {
    this._isTraversing = true;
    this.rootComponent.service.selection.set({
      elements: [element.id],
      editing: false,
    });
    this._ensureElementVisible(element);
    this._isTraversing = false;
  }

  private _resetNavigatorState() {
    this._navigatorState.isExploring = false;
    this._navigatorState.visitedNodes.clear();
    this._navigatorState.lastDirection = null;
    this._navigatorState.siblingNodes = [];
    this._navigatorState.siblingIndex = 0;
  }

  /**
   * Ensure the element is visible in the viewport
   */
  private _ensureElementVisible(element: GfxModel) {
    const viewport = this.rootComponent.service.viewport;

    // Ensure the element has elementBound property
    if (!('elementBound' in element)) return;

    const elementBound = element.elementBound;

    // Check if element is outside viewport
    const viewportBound = viewport.viewportBounds;
    const margin = 50; // Margin around the element

    const elementWithMargin = new Bound(
      elementBound.x - margin,
      elementBound.y - margin,
      elementBound.w + margin * 2,
      elementBound.h + margin * 2
    );

    // If element is not fully visible, smoothly move viewport to center it
    if (!viewportBound.contains(elementWithMargin)) {
      viewport.smoothTranslate(elementBound.center[0], elementBound.center[1]);
    }
  }
}
