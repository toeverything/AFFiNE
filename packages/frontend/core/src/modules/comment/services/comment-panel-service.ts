import { type WorkbenchService } from '@affine/core/modules/workbench';
import { LiveData, Service } from '@toeverything/infra';

import type { DocCommentEntity } from '../entities/doc-comment';

export type CommentPanelDisplayMode =
  | {
      type: 'all';
    }
  | {
      type: 'pending';
    }
  | {
      type: 'focused';
      commentId: string;
    }
  | {
      type: 'subset';
      commentIds: string[];
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
      if (pendingComment) {
        this.showPendingComment();
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
  openCommentPanel(options?: {
    focusedCommentId?: string | null;
    subsetCommentIds?: string[] | null;
  }): void {
    if (options?.focusedCommentId) {
      this.displayMode$.next({
        type: 'focused',
        commentId: options.focusedCommentId,
      });
    } else if (options?.subsetCommentIds?.length) {
      this.displayMode$.next({
        type: 'subset',
        commentIds: options.subsetCommentIds,
      });
    } else {
      this.showAllComments();
    }

    this.activateCommentTab();
  }

  showPendingComment(): void {
    this.displayMode$.next({
      type: 'pending',
    });

    this.activateCommentTab();
  }

  showAllComments(): void {
    this.displayMode$.next({
      type: 'all',
    });
  }

  private activateCommentTab(): void {
    const workbench = this.workbenchService.workbench;
    const activeView = workbench.activeView$.value;

    if (activeView) {
      workbench.openSidebar();
      activeView.activeSidebarTab('comment');
    }
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
