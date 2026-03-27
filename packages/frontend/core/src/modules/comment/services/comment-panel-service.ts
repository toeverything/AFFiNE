import { type WorkbenchService } from '@affine/core/modules/workbench';
import { LiveData, Service } from '@toeverything/infra';

import type { DocCommentEntity } from '../entities/doc-comment';

export type CommentPanelDisplayMode =
  | {
      type: 'all';
    }
  | {
      type: 'focused';
      commentId: string;
    };

export class CommentPanelService extends Service {
  constructor(private readonly workbenchService: WorkbenchService) {
    super();
  }

  private readonly activePendingWatchers = new Set<() => void>();
  readonly displayMode$ = new LiveData<CommentPanelDisplayMode>({
    type: 'all',
  });

  /**
   * Watch for pending comments on a doc comment entity and open the sidebar automatically
   */
  watchForPendingComments(entity: DocCommentEntity): () => void {
    const subscription = entity.pendingComment$.subscribe(pendingComment => {
      // If we have a new pending comment, open the comment panel
      if (pendingComment) {
        this.openCommentPanel();
      }
    });

    const dispose = () => {
      subscription.unsubscribe();
      this.activePendingWatchers.delete(dispose);
    };

    this.activePendingWatchers.add(dispose);
    return dispose;
  }

  /**
   * Open the sidebar and activate the comment tab
   */
  openCommentPanel(options?: { focusedCommentId?: string | null }): void {
    if (options?.focusedCommentId) {
      this.displayMode$.next({
        type: 'focused',
        commentId: options.focusedCommentId,
      });
    } else {
      this.showAllComments();
    }

    const workbench = this.workbenchService.workbench;
    const activeView = workbench.activeView$.value;

    if (activeView) {
      workbench.openSidebar();
      activeView.activeSidebarTab('comment');
    }
  }

  showAllComments(): void {
    this.displayMode$.next({
      type: 'all',
    });
  }

  override dispose(): void {
    // Clean up all active watchers
    for (const dispose of this.activePendingWatchers) {
      dispose();
    }
    this.activePendingWatchers.clear();
    super.dispose();
  }
}
