import {
  Avatar,
  IconButton,
  Loading,
  Menu,
  MenuItem,
  notify,
  useConfirmModal,
} from '@affine/component';
import { ServerService } from '@affine/core/modules/cloud';
import { AuthService } from '@affine/core/modules/cloud/services/auth';
import { type DocCommentEntity } from '@affine/core/modules/comment/entities/doc-comment';
import { CommentPanelService } from '@affine/core/modules/comment/services/comment-panel-service';
import { DocCommentManagerService } from '@affine/core/modules/comment/services/doc-comment-manager';
import type { DocComment } from '@affine/core/modules/comment/types';
import { DocService } from '@affine/core/modules/doc';
import { toDocSearchParams } from '@affine/core/modules/navigation';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { copyTextToClipboard } from '@affine/core/utils/clipboard';
import { i18nTime, useI18n } from '@affine/i18n';
import type { DocSnapshot } from '@blocksuite/affine/store';
import { DoneIcon, FilterIcon, MoreHorizontalIcon } from '@blocksuite/icons/rc';
import {
  useLiveData,
  useService,
  useServiceOptional,
} from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAsyncCallback } from '../../hooks/affine-async-hooks';
import { CommentEditor } from '../comment-editor';
import * as styles from './style.css';

interface CommentFilterState {
  showResolvedComments: boolean;
  onlyMyReplies: boolean;
  onlyCurrentMode: boolean;
}

const SortFilterButton = ({
  filterState,
  onFilterChange,
}: {
  filterState: CommentFilterState;
  onFilterChange: (key: keyof CommentFilterState, value: boolean) => void;
}) => {
  const t = useI18n();

  return (
    <Menu
      rootOptions={{ modal: false }}
      items={
        <>
          <MenuItem
            checked={filterState.showResolvedComments}
            onSelect={() =>
              onFilterChange(
                'showResolvedComments',
                !filterState.showResolvedComments
              )
            }
          >
            {t['com.affine.comment.filter.show-resolved']()}
          </MenuItem>
          <MenuItem
            checked={filterState.onlyMyReplies}
            onSelect={() =>
              onFilterChange('onlyMyReplies', !filterState.onlyMyReplies)
            }
          >
            {t['com.affine.comment.filter.only-my-replies']()}
          </MenuItem>
          <MenuItem
            checked={filterState.onlyCurrentMode}
            onSelect={() =>
              onFilterChange('onlyCurrentMode', !filterState.onlyCurrentMode)
            }
          >
            {t['com.affine.comment.filter.only-current-mode']()}
          </MenuItem>
        </>
      }
    >
      <IconButton icon={<FilterIcon />} />
    </Menu>
  );
};

const ReadonlyCommentRenderer = ({
  avatarUrl,
  name,
  time,
  snapshot,
}: {
  avatarUrl: string | null;
  name: string;
  time: number;
  snapshot: DocSnapshot;
}) => {
  return (
    <div data-time={time} className={styles.readonlyCommentContainer}>
      <div className={styles.userContainer}>
        <Avatar url={avatarUrl} size={24} />
        <div className={styles.userName}>{name}</div>
        <div className={styles.time}>
          {i18nTime(time, {
            absolute: { accuracy: 'minute' },
          })}
        </div>
      </div>
      <div style={{ marginLeft: '34px' }}>
        <CommentEditor readonly defaultSnapshot={snapshot} />
      </div>
    </div>
  );
};

const CommentItem = ({
  comment,
  entity,
}: {
  comment: DocComment;
  entity: DocCommentEntity;
}) => {
  const workbench = useService(WorkbenchService);
  const serverService = useService(ServerService);
  const highlighting = useLiveData(entity.commentHighlighted$) === comment.id;
  const t = useI18n();
  const { openConfirmModal } = useConfirmModal();

  const session = useService(AuthService).session;
  const account = useLiveData(session.account$);

  const pendingReply = useLiveData(entity.pendingReply$);
  // Check if the pending reply belongs to this comment
  const isReplyingToThisComment = pendingReply?.commentId === comment.id;

  const commentRef = useRef<HTMLDivElement>(null);

  // Loading state for any async operation
  const [isMutating, setIsMutating] = useState(false);

  const handleDelete = useAsyncCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      openConfirmModal({
        title: t['com.affine.comment.delete.confirm.title'](),
        description: t['com.affine.comment.delete.confirm.description'](),
        confirmText: t['Delete'](),
        cancelText: t['Cancel'](),
        confirmButtonOptions: {
          variant: 'error',
        },
        onConfirm: async () => {
          setIsMutating(true);
          try {
            await entity.deleteComment(comment.id);
          } finally {
            setIsMutating(false);
          }
        },
      });
    },
    [entity, comment.id, openConfirmModal, t]
  );

  const handleResolve = useAsyncCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsMutating(true);
      try {
        await entity.resolveComment(comment.id, !comment.resolved);
      } finally {
        setIsMutating(false);
      }
    },
    [entity, comment.id, comment.resolved]
  );

  const handleReply = useAsyncCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!comment.resolved) {
        await entity.addReply(comment.id);
        entity.highlightComment(comment.id);
      }
    },
    [entity, comment.id, comment.resolved]
  );

  const handleCopyLink = useAsyncCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      // Create a URL with the comment ID

      const search = toDocSearchParams({
        mode: comment.content.mode,
        commentId: comment.id,
      });

      const url = new URL(
        workbench.workbench.basename$.value + '/' + entity.props.docId,
        serverService.server.baseUrl
      );

      if (search?.size) url.search = search.toString();
      await copyTextToClipboard(url.toString());
      notify.success({ title: t['Copied link to clipboard']() });
    },
    [
      comment.content.mode,
      comment.id,
      entity.props.docId,
      serverService.server.baseUrl,
      t,
      workbench.workbench.basename$.value,
    ]
  );

  const handleCommitReply = useAsyncCallback(async () => {
    if (!pendingReply?.id) return;

    setIsMutating(true);
    try {
      await entity.commitReply(pendingReply.id);
    } finally {
      setIsMutating(false);
    }
  }, [entity, pendingReply]);

  const handleCancelReply = useCallback(() => {
    if (!pendingReply?.id) return;

    entity.dismissDraftReply();
  }, [entity, pendingReply]);

  const handleClickPreview = useCallback(() => {
    workbench.workbench.openDoc(
      {
        docId: entity.props.docId,
        mode: comment.content.mode,
        commentId: comment.id,
        refreshKey: 'comment-' + Date.now(),
      },
      {
        show: true,
      }
    );
    entity.highlightComment(comment.id);
  }, [comment.id, comment.content.mode, entity, workbench.workbench]);

  useEffect(() => {
    const subscription = entity.commentHighlighted$
      .distinctUntilChanged()
      .subscribe(id => {
        if (id === comment.id && commentRef.current) {
          commentRef.current.scrollIntoView({ behavior: 'smooth' });

          // Auto-start reply when comment becomes highlighted, but only if not resolved
          if (!isReplyingToThisComment && !comment.resolved) {
            entity.addReply(comment.id).catch(() => {
              // Handle error if adding reply fails
              console.error('Failed to add reply for comment:', comment.id);
            });
          }
        } else if (
          id !== comment.id &&
          isReplyingToThisComment &&
          pendingReply
        ) {
          // Cancel reply when comment is no longer highlighted
          entity.dismissDraftReply();
        }
      });

    return () => {
      subscription.unsubscribe();
    };
  }, [
    comment.id,
    comment.resolved,
    entity.commentHighlighted$,
    isReplyingToThisComment,
    pendingReply,
    entity,
  ]);

  // Clean up pending reply if comment becomes resolved
  useEffect(() => {
    if (comment.resolved && isReplyingToThisComment && pendingReply) {
      entity.dismissDraftReply();
    }
  }, [comment.resolved, isReplyingToThisComment, pendingReply, entity]);

  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      onClick={handleClickPreview}
      data-comment-id={comment.id}
      data-resolved={comment.resolved}
      data-highlighting={highlighting || menuOpen}
      className={styles.commentItem}
      ref={commentRef}
    >
      <div className={styles.commentActions} data-menu-open={menuOpen}>
        <IconButton
          variant="solid"
          onClick={handleResolve}
          icon={<DoneIcon />}
          disabled={isMutating}
        />
        <Menu
          rootOptions={{
            open: menuOpen,
            onOpenChange: v => {
              setMenuOpen(v);
            },
          }}
          items={
            <>
              <MenuItem
                onClick={handleReply}
                disabled={isMutating || comment.resolved}
              >
                {t['com.affine.comment.reply']()}
              </MenuItem>
              <MenuItem onClick={handleCopyLink} disabled={isMutating}>
                {t['com.affine.comment.copy-link']()}
              </MenuItem>
              <MenuItem
                onClick={handleDelete}
                disabled={isMutating}
                style={{ color: 'var(--affine-error-color)' }}
              >
                {t['Delete']()}
              </MenuItem>
            </>
          }
        >
          <IconButton
            variant="solid"
            icon={<MoreHorizontalIcon />}
            disabled={isMutating}
          />
        </Menu>
      </div>
      <div className={styles.previewContainer}>{comment.content.preview}</div>

      <div className={styles.repliesContainer}>
        <ReadonlyCommentRenderer
          avatarUrl={comment.user.avatarUrl}
          name={comment.user.name}
          time={comment.createdAt}
          snapshot={comment.content.snapshot}
        />

        {/* unlike comment, replies are sorted by createdAt in ascending order */}
        {comment.replies
          ?.toSorted((a, b) => a.createdAt - b.createdAt)
          .map(reply => (
            <ReadonlyCommentRenderer
              key={reply.id}
              avatarUrl={reply.user.avatarUrl}
              name={reply.user.name}
              time={reply.createdAt}
              snapshot={reply.content.snapshot}
            />
          ))}
      </div>

      {highlighting &&
        isReplyingToThisComment &&
        pendingReply &&
        account &&
        !comment.resolved && (
          <div className={styles.commentInputContainer}>
            <div className={styles.userContainer}>
              <Avatar url={account.avatar} size={24} />
            </div>
            <CommentEditor
              autoFocus
              doc={pendingReply.doc}
              onCommit={isMutating ? undefined : handleCommitReply}
              onCancel={isMutating ? undefined : handleCancelReply}
            />
          </div>
        )}
    </div>
  );
};

const CommentList = ({ entity }: { entity: DocCommentEntity }) => {
  const comments = useLiveData(entity.comments$);
  const session = useService(AuthService).session;
  const account = useLiveData(session.account$);
  const t = useI18n();

  const docMode = useLiveData(entity.docMode$);

  // Filter state management
  const [filterState, setFilterState] = useState<CommentFilterState>({
    showResolvedComments: false,
    onlyMyReplies: false,
    onlyCurrentMode: true,
  });

  const onFilterChange = useCallback(
    (key: keyof CommentFilterState, value: boolean) => {
      setFilterState(prev => ({ ...prev, [key]: value }));
    },
    []
  );

  // Filter and sort comments based on filter state
  const filteredAndSortedComments = useMemo(() => {
    let filteredComments = comments;

    // Filter by resolved status
    if (!filterState.showResolvedComments) {
      filteredComments = filteredComments.filter(comment => !comment.resolved);
    }

    // Filter by only my replies and mentions
    if (filterState.onlyMyReplies) {
      filteredComments = filteredComments.filter(comment => {
        return (
          comment.user.id === account?.id ||
          comment.replies?.some(reply => reply.user.id === account?.id)
        );
      });
    }

    // Filter by only current mode
    if (filterState.onlyCurrentMode) {
      filteredComments = filteredComments.filter(comment => {
        return (
          !comment.content.mode || !docMode || comment.content.mode === docMode
        );
      });
    }
    return filteredComments.toSorted((a, b) => b.createdAt - a.createdAt);
  }, [
    comments,
    filterState.showResolvedComments,
    filterState.onlyMyReplies,
    filterState.onlyCurrentMode,
    account?.id,
    docMode,
  ]);

  const newPendingComment = useLiveData(entity.pendingComment$);
  const loading = useLiveData(entity.loading$);

  return (
    <>
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          {t['com.affine.comment.comments']()}
        </div>
        {comments.length > 0 && (
          <SortFilterButton
            filterState={filterState}
            onFilterChange={onFilterChange}
          />
        )}
      </div>
      <CommentInput entity={entity} />
      {filteredAndSortedComments.length === 0 &&
        !newPendingComment &&
        !loading && (
          <div className={styles.empty}>
            {t['com.affine.comment.no-comments']()}
          </div>
        )}
      {loading &&
        filteredAndSortedComments.length === 0 &&
        !newPendingComment && (
          <div className={styles.loading}>
            <Loading size={32} />
          </div>
        )}
      <div className={styles.commentList}>
        {filteredAndSortedComments.map(comment => (
          <CommentItem key={comment.id} comment={comment} entity={entity} />
        ))}
      </div>
    </>
  );
};

// handling pending comment
const CommentInput = ({ entity }: { entity: DocCommentEntity }) => {
  const newPendingComment = useLiveData(entity.pendingComment$);
  const pendingPreview = newPendingComment?.preview;
  const [isMutating, setIsMutating] = useState(false);

  const handleCommit = useAsyncCallback(async () => {
    if (!newPendingComment?.id) return;
    setIsMutating(true);
    try {
      await entity.commitComment(newPendingComment.id);
    } finally {
      setIsMutating(false);
    }
  }, [entity, newPendingComment]);

  const handleCancel = useCallback(() => {
    if (!newPendingComment?.id) return;

    entity.dismissDraftComment();
  }, [entity, newPendingComment]);

  const session = useService(AuthService).session;
  const account = useLiveData(session.account$);

  if (!newPendingComment || !account) {
    return null;
  }

  return (
    <div className={styles.pendingComment} data-pending-comment>
      {pendingPreview && (
        <div className={styles.previewContainer}>{pendingPreview}</div>
      )}
      <div className={styles.commentInputContainer}>
        <div className={styles.userContainer}>
          <Avatar url={account.avatar} size={24} />
        </div>
        <CommentEditor
          autoFocus
          doc={newPendingComment.doc}
          onCommit={isMutating ? undefined : handleCommit}
          onCancel={isMutating ? undefined : handleCancel}
        />
      </div>
    </div>
  );
};

const useCommentEntity = (docId: string | undefined) => {
  const docCommentManager = useService(DocCommentManagerService);
  const commentPanelService = useService(CommentPanelService);
  const [entity, setEntity] = useState<DocCommentEntity | null>(null);

  useEffect(() => {
    if (!docId) {
      return;
    }

    const entityRef = docCommentManager.get(docId);
    setEntity(entityRef.obj);
    entityRef.obj.start();
    entityRef.obj.revalidate();

    // Set up pending comment watching to auto-open sidebar
    const unwatchPending = commentPanelService.watchForPendingComments(
      entityRef.obj
    );

    return () => {
      unwatchPending();
      entityRef.release();
    };
  }, [docCommentManager, commentPanelService, docId]);

  return entity;
};

export const CommentSidebar = () => {
  const doc = useServiceOptional(DocService)?.doc;
  const entity = useCommentEntity(doc?.id);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    // dismiss the highlight when ESC is pressed
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        entity?.highlightComment(null);
      }
    };
    const handleContainerClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-comment-id]')) {
        entity?.highlightComment(null);
      }
      // if creating a new comment, dismiss the comment input
      if (
        entity?.pendingComment$.value &&
        !target.closest('[data-pending-comment]')
      ) {
        entity.dismissDraftComment();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    container?.addEventListener('click', handleContainerClick);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      container?.removeEventListener('click', handleContainerClick);
      entity?.highlightComment(null);
    };
  }, [entity]);

  if (!entity) {
    return null;
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <CommentList entity={entity} />
    </div>
  );
};
