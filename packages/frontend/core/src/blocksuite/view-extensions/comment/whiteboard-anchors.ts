import type {
  WhiteboardCommentAnchor,
  WhiteboardCommentAnchors,
} from '@affine/whiteboard';
import { WhiteboardCommentAnchorsIdentifier } from '@affine/whiteboard';
import type { BlockStdScope } from '@blocksuite/affine/std';
import { StdIdentifier } from '@blocksuite/affine/std';
import type { ExtensionType } from '@blocksuite/affine/store';
import type { FrameworkProvider } from '@toeverything/infra';

import { DocCommentManagerService } from '../../../modules/comment/services/doc-comment-manager';

/**
 * Exposes the `{ blockId, point, rowId }` anchor stored on each comment so the
 * whiteboard collab layer can place its canvas pins. `CommentProvider` only
 * carries comment ids, and the whiteboard package cannot depend on core.
 */
class DocCommentAnchors implements WhiteboardCommentAnchors {
  constructor(
    private readonly std: BlockStdScope,
    private readonly framework: FrameworkProvider
  ) {}

  private ref() {
    return this.framework.get(DocCommentManagerService).get(this.std.store.id);
  }

  get(commentId: string): WhiteboardCommentAnchor | undefined {
    const ref = this.ref();
    try {
      return ref.obj.comments$.value.find(comment => comment.id === commentId)
        ?.content?.anchor;
    } finally {
      ref.release();
    }
  }

  subscribe(onChange: () => void) {
    const ref = this.ref();
    const subscription = ref.obj.comments$.subscribe(() => onChange());
    return () => {
      subscription.unsubscribe();
      ref.release();
    };
  }
}

export function AffineWhiteboardCommentAnchors(
  framework: FrameworkProvider
): ExtensionType {
  return {
    setup: di => {
      di.addImpl(
        WhiteboardCommentAnchorsIdentifier,
        provider =>
          new DocCommentAnchors(provider.get(StdIdentifier), framework)
      );
    },
  };
}
