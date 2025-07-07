import {
  Avatar,
  IconButton,
  Loading,
  Menu,
  MenuItem,
  notify,
  useConfirmModal,
} from '@affine/component';
import { useGuard } from '@affine/core/components/guard';
import { ServerService } from '@affine/core/modules/cloud';
import { AuthService } from '@affine/core/modules/cloud/services/auth';
import { type DocCommentEntity } from '@affine/core/modules/comment/entities/doc-comment';
import { CommentPanelService } from '@affine/core/modules/comment/services/comment-panel-service';
import { DocCommentManagerService } from '@affine/core/modules/comment/services/doc-comment-manager';
import type {
  DocComment,
  DocCommentReply,
} from '@affine/core/modules/comment/types';
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
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { useAsyncCallback } from '../../hooks/affine-async-hooks';
import { CommentEditor, type CommentEditorRef } from '../comment-editor';
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

  const docId = entity.props.docId;
  const canCreateComment = useGuard('Doc_Comments_Create', docId);
  const canDeleteComment = useGuard('Doc_Comments_Delete', docId);
  const canResolveComment = useGuard('Doc_Comments_Resolve', docId);

  const pendingReply = useLiveData(entity.pendingReply$);
  // Check if the pending reply belongs to this comment
  const isReplyingToThisComment = pendingReply?.commentId === comment.id;

  const commentRef = useRef<HTMLDivElement>(null);

  // Loading state for any async operation
  const [isMutating, setIsMutating] = useState(false);

  const editingDraft = useLiveData(entity.editingDraft$);
  const isEditing =
    editingDraft?.type === 'comment' && editingDraft.id === comment.id;
  const editingDoc = isEditing ? editingDraft.doc : undefined;

  const [replyEditor, setReplyEditor] = useState<CommentEditorRef | null>(null);

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

  const handleReply = useAsyncCallback(async () => {
    if (comment.resolved) return;
    await entity.addReply(comment.id);
    entity.highlightComment(comment.id);
    if (replyEditor) {
      // todo: it seems we need to wait for 1000ms
      // to ensure the menu closing animation is complete
      setTimeout(() => {
        replyEditor.focus();
      }, 1000);
    }
  }, [entity, comment.id, comment.resolved, replyEditor]);

  const handleCopyLink = useAsyncCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      // Create a URL with the comment ID

      if (!comment.content) return;

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
      comment.content,
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
        mode: comment.content?.mode,
        commentId: comment.id,
        refreshKey: 'comment-' + Date.now(),
      },
      {
        replaceHistory: true,
      }
    );
    entity.highlightComment(comment.id);
  }, [comment.id, comment.content?.mode, entity, workbench.workbench]);

  useEffect(() => {
    const subscription = entity.commentHighlighted$
      .pipe(debounceTime(0), distinctUntilChanged())
      .subscribe(id => {
        if (id === comment.id && commentRef.current) {
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

  // Replies handled by ReplyList component; no local collapsed logic here.

  const handleStartEdit = useAsyncCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (comment.resolved || !comment.content) return;
      await entity.startEdit(comment.id, 'comment', comment.content.snapshot);
    },
    [entity, comment.id, comment.content, comment.resolved]
  );

  const handleCommitEdit = useAsyncCallback(async () => {
    setIsMutating(true);
    try {
      await entity.commitEditing();
    } finally {
      setIsMutating(false);
    }
  }, [entity]);

  const handleCancelEdit = useCallback(() => {
    entity.dismissDraftEditing();
  }, [entity]);

  const isMyComment = account && account.id === comment.user.id;
  const canReply = canCreateComment;
  const canEdit = isMyComment && canCreateComment;
  const canDelete =
    (isMyComment && canCreateComment) || (!isMyComment && canDeleteComment);

  // invalid comment, should not happen
  if (!comment.content) {
    return null;
  }

  return (
    <div
      onClick={handleClickPreview}
      data-comment-id={comment.id}
      data-resolved={comment.resolved}
      data-highlighting={highlighting || menuOpen}
      className={styles.commentItem}
      ref={commentRef}
    >
      <div
        className={styles.commentActions}
        data-menu-open={menuOpen}
        data-editing={isEditing}
      >
        {!comment.resolved && canResolveComment && (
          <IconButton
            variant="solid"
            onClick={handleResolve}
            icon={<DoneIcon />}
            disabled={isMutating}
          />
        )}
        <Menu
          rootOptions={{
            open: menuOpen,
            onOpenChange: v => {
              setMenuOpen(v);
            },
          }}
          items={
            <>
              {canReply ? (
                <MenuItem
                  onClick={handleReply}
                  disabled={isMutating || comment.resolved}
                >
                  {t['com.affine.comment.reply']()}
                </MenuItem>
              ) : null}
              <MenuItem onClick={handleCopyLink} disabled={isMutating}>
                {t['com.affine.comment.copy-link']()}
              </MenuItem>
              {canEdit ? (
                <MenuItem
                  onClick={handleStartEdit}
                  disabled={isMutating || comment.resolved}
                >
                  {t['Edit']()}
                </MenuItem>
              ) : null}
              {canDelete ? (
                <MenuItem
                  onClick={handleDelete}
                  disabled={isMutating}
                  style={{ color: 'var(--affine-error-color)' }}
                >
                  {t['Delete']()}
                </MenuItem>
              ) : null}
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
      <div className={styles.previewContainer}>{comment.content?.preview}</div>

      <div className={styles.repliesContainer}>
        {isEditing && editingDoc ? (
          <div className={styles.commentInputContainer}>
            <div className={styles.userContainer}>
              <Avatar url={account?.avatar} size={24} />
            </div>
            <CommentEditor
              doc={editingDoc}
              autoFocus
              onCommit={isMutating ? undefined : handleCommitEdit}
              onCancel={isMutating ? undefined : handleCancelEdit}
            />
          </div>
        ) : (
          <ReadonlyCommentRenderer
            avatarUrl={comment.user.avatarUrl}
            name={comment.user.name}
            time={comment.createdAt}
            snapshot={comment.content.snapshot}
          />
        )}
        {comment.replies && comment.replies.length > 0 && (
          <ReplyList
            replies={comment.replies}
            parentComment={comment}
            entity={entity}
            replyEditor={replyEditor}
          />
        )}
      </div>

      {!editingDraft &&
        highlighting &&
        isReplyingToThisComment &&
        pendingReply &&
        account &&
        !comment.resolved &&
        canCreateComment && (
          <div className={styles.commentInputContainer}>
            <div className={styles.userContainer}>
              <Avatar url={account.avatar} size={24} />
            </div>
            <CommentEditor
              ref={setReplyEditor}
              autoFocus
              doc={pendingReply.doc}
              onCommit={
                isMutating || !canCreateComment ? undefined : handleCommitReply
              }
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
    if (filterState.onlyMyReplies && account) {
      filteredComments = filteredComments.filter(comment => {
        return (
          comment.user.id === account.id ||
          comment.mentions.includes(account.id) ||
          comment.replies?.some(reply => {
            return (
              reply.user.id === account.id ||
              reply.mentions.includes(account.id)
            );
          })
        );
      });

      filteredComments = filteredComments.map(comment => {
        return {
          ...comment,
          replies: comment.replies?.filter(reply => {
            return (
              reply.user.id === account.id ||
              reply.mentions.includes(account.id)
            );
          }),
        };
      });
    }

    // Filter by only current mode
    if (filterState.onlyCurrentMode) {
      filteredComments = filteredComments.filter(comment => {
        return (
          !comment.content?.mode || !docMode || comment.content.mode === docMode
        );
      });
    }
    return filteredComments.toSorted((a, b) => b.createdAt - a.createdAt);
  }, [
    comments,
    filterState.showResolvedComments,
    filterState.onlyMyReplies,
    filterState.onlyCurrentMode,
    docMode,
    account,
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

  const docId = entity.props.docId;
  const canCreateComment = useGuard('Doc_Comments_Create', docId);

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

  if (!newPendingComment || !account || !canCreateComment) {
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
          onCommit={isMutating || !canCreateComment ? undefined : handleCommit}
          onCancel={isMutating ? undefined : handleCancel}
        />
      </div>
    </div>
  );
};

interface ReplyItemProps {
  reply: DocCommentReply;
  parentComment: DocComment;
  entity: DocCommentEntity;
  replyEditor: CommentEditorRef | null;
}

const ReplyItem = ({
  reply,
  parentComment,
  entity,
  replyEditor,
}: ReplyItemProps) => {
  const t = useI18n();
  const session = useService(AuthService).session;
  const account = useLiveData(session.account$);
  const { openConfirmModal } = useConfirmModal();

  const [isMutating, setIsMutating] = useState(false);
  const editingDraft = useLiveData(entity.editingDraft$);
  const isEditingThisReply =
    editingDraft?.type === 'reply' && editingDraft.id === reply.id;
  const editingDoc = isEditingThisReply ? editingDraft.doc : undefined;

  const docId = entity.props.docId;
  const canCreateComment = useGuard('Doc_Comments_Create', docId);
  const canDeleteComment = useGuard('Doc_Comments_Delete', docId);

  const handleStartEdit = useAsyncCallback(async () => {
    if (parentComment.resolved || !reply.content) return;
    await entity.startEdit(reply.id, 'reply', reply.content.snapshot);
  }, [entity, parentComment.resolved, reply.id, reply.content]);

  const handleCommitEdit = useAsyncCallback(async () => {
    setIsMutating(true);
    try {
      await entity.commitEditing();
    } finally {
      setIsMutating(false);
    }
  }, [entity]);

  const handleCancelEdit = useCallback(
    () => entity.dismissDraftEditing(),
    [entity]
  );

  const handleDelete = useAsyncCallback(async () => {
    openConfirmModal({
      title: t['com.affine.comment.reply.delete.confirm.title'](),
      description: t['com.affine.comment.reply.delete.confirm.description'](),
      confirmText: t['Delete'](),
      cancelText: t['Cancel'](),
      confirmButtonOptions: {
        variant: 'error',
      },
      onConfirm: async () => {
        setIsMutating(true);
        try {
          await entity.deleteReply(reply.id);
        } finally {
          setIsMutating(false);
        }
      },
    });
  }, [openConfirmModal, t, entity, reply.id]);

  const handleReply = useAsyncCallback(async () => {
    if (parentComment.resolved) return;
    await entity.addReply(parentComment.id, reply);
    entity.highlightComment(parentComment.id);
    if (replyEditor) {
      // todo: find out why we need to wait for 100ms
      setTimeout(() => {
        replyEditor.focus();
      }, 100);
    }
  }, [entity, parentComment.id, parentComment.resolved, reply, replyEditor]);

  const isMyReply = account && account.id === reply.user.id;
  const canReply = canCreateComment;
  const canEdit = isMyReply && canCreateComment;
  const canDelete =
    (isMyReply && canCreateComment) || (!isMyReply && canDeleteComment);

  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // invalid reply, should not happen
  if (!reply.content) {
    return null;
  }

  return (
    <div className={styles.replyItem} data-reply-id={reply.id}>
      <div
        className={styles.replyActions}
        data-menu-open={isMenuOpen}
        data-editing={isEditingThisReply}
      >
        <Menu
          rootOptions={{
            onOpenChange: setIsMenuOpen,
            open: isMenuOpen,
          }}
          items={
            <>
              {canReply ? (
                <MenuItem
                  onClick={handleReply}
                  disabled={isMutating || parentComment.resolved}
                >
                  {t['com.affine.comment.reply']()}
                </MenuItem>
              ) : null}
              {canEdit ? (
                <MenuItem
                  onClick={handleStartEdit}
                  disabled={isMutating || parentComment.resolved}
                >
                  {t['Edit']()}
                </MenuItem>
              ) : null}
              {canDelete ? (
                <MenuItem
                  onClick={handleDelete}
                  style={{ color: 'var(--affine-error-color)' }}
                  disabled={isMutating}
                >
                  {t['Delete']()}
                </MenuItem>
              ) : null}
            </>
          }
        >
          <IconButton
            icon={<MoreHorizontalIcon />}
            variant="solid"
            disabled={isMutating}
          />
        </Menu>
      </div>

      {isEditingThisReply && editingDoc ? (
        <div className={styles.commentInputContainer}>
          <div className={styles.userContainer}>
            <Avatar url={account?.avatar} size={24} />
          </div>
          <CommentEditor
            doc={editingDoc}
            autoFocus
            onCommit={isMutating ? undefined : handleCommitEdit}
            onCancel={isMutating ? undefined : handleCancelEdit}
          />
        </div>
      ) : (
        <ReadonlyCommentRenderer
          avatarUrl={reply.user.avatarUrl}
          name={reply.user.name}
          time={reply.createdAt}
          snapshot={reply.content.snapshot}
        />
      )}
    </div>
  );
};

interface ReplyListProps {
  replies: DocCommentReply[];
  parentComment: DocComment;
  entity: DocCommentEntity;
  replyEditor: CommentEditorRef | null;
}

const ReplyList = ({
  replies,
  parentComment,
  entity,
  replyEditor,
}: ReplyListProps) => {
  const t = useI18n();
  // When the comment item is rendered the first time, the replies will be collapsed by default
  // The replies will be collapsed when replies length > 4, that is, the comment, first reply and the last 2 replies
  // will be shown
  // When new reply is added either by clicking the reply button or synced remotely, we will NOT collapse the replies
  const [collapsed, setCollapsed] = useState((replies.length ?? 0) > 4);

  const renderedReplies = useMemo(() => {
    // Sort replies ascending by createdAt
    const sortedReplies =
      replies.toSorted((a, b) => a.createdAt - b.createdAt) ?? [];
    if (sortedReplies.length === 0) return null;

    // If not collapsed or replies are fewer than threshold, render all
    if (!collapsed || sortedReplies.length <= 4) {
      return sortedReplies.map(reply => (
        <ReplyItem
          key={reply.id}
          reply={reply}
          parentComment={parentComment}
          entity={entity}
          replyEditor={replyEditor}
        />
      ));
    }

    // Collapsed state: first reply + collapsed indicator + last two replies
    const firstReply = sortedReplies[0];
    const tailReplies = sortedReplies.slice(-2);

    return (
      <>
        <ReplyItem
          key={firstReply.id}
          reply={firstReply}
          parentComment={parentComment}
          entity={entity}
          replyEditor={replyEditor}
        />
        <div
          className={styles.collapsedReplies}
          onClick={e => {
            e.stopPropagation();
            setCollapsed(false);
          }}
        >
          <div className={styles.collapsedRepliesTitle}>
            {t['com.affine.comment.reply.show-more']({
              count: (sortedReplies.length - 4).toString(),
            })}
          </div>
        </div>
        {tailReplies.map(reply => (
          <ReplyItem
            key={reply.id}
            reply={reply}
            parentComment={parentComment}
            entity={entity}
            replyEditor={replyEditor}
          />
        ))}
      </>
    );
  }, [collapsed, replies, t, entity, parentComment, replyEditor]);

  return <div className={styles.repliesContainer}>{renderedReplies}</div>;
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

    // Set up pending comment watching to auto-open sidebar
    const unwatchPending = commentPanelService.watchForPendingComments(
      entityRef.obj
    );

    return () => {
      unwatchPending();
      entityRef.obj.stop();
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
        entity?.dismissDraftEditing();
      }
    };
    const handleContainerClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-comment-id]')) {
        entity?.highlightComment(null);
        entity?.dismissDraftEditing();
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
