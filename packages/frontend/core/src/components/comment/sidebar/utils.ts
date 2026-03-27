import type { DocMode } from '@blocksuite/affine/model';

import type { CommentPanelDisplayMode } from '../../../modules/comment/services/comment-panel-service';
import type { DocComment } from '../../../modules/comment/types';

export interface CommentFilterState {
  showResolvedComments: boolean;
  onlyMyReplies: boolean;
  onlyCurrentMode: boolean;
}

type GetVisibleCommentsOptions = {
  comments: DocComment[];
  displayMode: CommentPanelDisplayMode;
  filterState: CommentFilterState;
  accountId?: string;
  docMode?: DocMode | null;
};

export function shouldResetFocusedCommentsOnSidebarClick(
  _target: HTMLElement
): boolean {
  return false;
}

export function getVisibleComments({
  comments,
  displayMode,
  filterState,
  accountId,
  docMode,
}: GetVisibleCommentsOptions): DocComment[] {
  if (displayMode.type === 'focused') {
    const focusedComment = comments.find(
      comment => comment.id === displayMode.commentId
    );

    return focusedComment ? [focusedComment] : [];
  }

  let filteredComments = comments;

  if (!filterState.showResolvedComments) {
    filteredComments = filteredComments.filter(comment => !comment.resolved);
  }

  if (filterState.onlyMyReplies && accountId) {
    filteredComments = filteredComments.filter(comment => {
      return (
        comment.user.id === accountId ||
        comment.mentions.includes(accountId) ||
        comment.replies?.some(reply => {
          return (
            reply.user.id === accountId || reply.mentions.includes(accountId)
          );
        })
      );
    });

    filteredComments = filteredComments.map(comment => {
      return {
        ...comment,
        replies: comment.replies?.filter(reply => {
          return (
            reply.user.id === accountId || reply.mentions.includes(accountId)
          );
        }),
      };
    });
  }

  if (filterState.onlyCurrentMode) {
    filteredComments = filteredComments.filter(comment => {
      return (
        !comment.content?.mode || !docMode || comment.content.mode === docMode
      );
    });
  }

  return filteredComments.toSorted((a, b) => b.createdAt - a.createdAt);
}
