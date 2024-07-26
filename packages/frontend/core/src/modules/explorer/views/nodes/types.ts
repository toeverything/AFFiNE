import type { DropTargetDropEvent, DropTargetOptions } from '@affine/component';
import type { AffineDNDData } from '@affine/core/types/dnd';

import type { ExplorerTreeNodeDropEffect } from '../tree';
import type { NodeOperation } from '../tree/types';

/**
 * The interface for a generic explorer node.
 *
 * # Drop controlled area
 *
 * When an element is dragged over the node, there are two controlled areas depending on the mouse position.
 *
 * **Make Child Area**:
 * When the mouse is in the center area of the node, it is in `Make Child Area`,
 * `canDrop`, `onDrop`, and `dropEffect` are handled by the node itself.
 *
 * **Edge Area**:
 * When the mouse is at the upper edge, lower edge, or front of a node, it is located in the `Edge Area`,
 * and all drop events are handled by the node's parent, which callbacks in this interface.
 *
 * The controlled area can be distinguished by `data.treeInstruction.type` in the callback parameter.
 */
export interface GenericExplorerNode {
  /**
   * Tell the node and dropTarget where the node is located in the tree
   */
  location?: AffineDNDData['draggable']['from'];
  /**
   * Whether the node is allowed to reorder with its sibling nodes
   */
  reorderable?: boolean;
  /**
   * Additional operations to be displayed in the node
   */
  operations?: NodeOperation[];
  /**
   * Control whether drop is allowed, the callback will be called when dragging.
   */
  canDrop?: DropTargetOptions<AffineDNDData>['canDrop'];
  /**
   * Called when an element is dropped over the node.
   */
  onDrop?: (data: DropTargetDropEvent<AffineDNDData>) => void;
  /**
   * The drop effect to be used when an element is dropped over the node.
   */
  dropEffect?: ExplorerTreeNodeDropEffect;
}
