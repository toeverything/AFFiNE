import { createIdentifier } from '@blocksuite/affine/global/di';
import type { ExtensionType } from '@blocksuite/affine/store';

import type { WhiteboardCommentAnchor } from './comment-anchor';

/**
 * Bridges comment anchors into the canvas.
 *
 * `CommentProvider` only exposes comment ids; the `{ blockId, point, rowId }`
 * anchor lives in the host app's comment content. The host registers this so
 * the collab layer can place pins where the comment was actually dropped.
 */
export interface WhiteboardCommentAnchors {
  get(commentId: string): WhiteboardCommentAnchor | undefined;
  /** Fires whenever the anchor set changes, so pins can be redrawn. */
  subscribe(onChange: () => void): () => void;
}

export const WhiteboardCommentAnchorsIdentifier =
  createIdentifier<WhiteboardCommentAnchors>(
    'affine-whiteboard-comment-anchors'
  );

export function WhiteboardCommentAnchorsExtension(
  anchors: WhiteboardCommentAnchors
): ExtensionType {
  return {
    setup: di => {
      di.addImpl(WhiteboardCommentAnchorsIdentifier, () => anchors);
    },
  };
}
