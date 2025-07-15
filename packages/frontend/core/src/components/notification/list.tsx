import {
  Avatar,
  Button,
  IconButton,
  Menu,
  MenuItem,
  notify,
  observeIntersection,
  Scrollable,
  Skeleton,
} from '@affine/component';
import { InvitationService } from '@affine/core/modules/cloud';
import {
  type Notification,
  NotificationListService,
  NotificationType,
} from '@affine/core/modules/notification';
import { WorkspacesService } from '@affine/core/modules/workspace';
import { extractEmojiIcon } from '@affine/core/utils';
import { UserFriendlyError } from '@affine/error';
import type {
  InvitationAcceptedNotificationBodyType,
  InvitationBlockedNotificationBodyType,
  InvitationNotificationBodyType,
  InvitationReviewApprovedNotificationBodyType,
  InvitationReviewDeclinedNotificationBodyType,
  InvitationReviewRequestNotificationBodyType,
  MentionNotificationBodyType,
} from '@affine/graphql';
import { i18nTime, Trans, useI18n } from '@affine/i18n';
import track from '@affine/track';
import {
  CollaborationIcon,
  DeleteIcon,
  EdgelessIcon,
  MoreHorizontalIcon,
  NotificationIcon,
  PageIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useNavigateHelper } from '../hooks/use-navigate-helper';
import * as styles from './list.style.css';

export const NotificationList = () => {
  const t = useI18n();
  const notificationListService = useService(NotificationListService);
  const notifications = useLiveData(notificationListService.notifications$);
  const isLoading = useLiveData(notificationListService.isLoading$);
  const error = useLiveData(notificationListService.error$);
  const hasMore = useLiveData(notificationListService.hasMore$);
  const loadMoreIndicatorRef = useRef<HTMLDivElement>(null);

  const userFriendlyError = useMemo(() => {
    return error && UserFriendlyError.fromAny(error);
  }, [error]);

  useLayoutEffect(() => {
    // reset the notification list when the component is mounted
    notificationListService.reset();
    notificationListService.loadMore();
  }, [notificationListService]);

  useEffect(() => {
    if (loadMoreIndicatorRef.current) {
      let previousIsIntersecting = false;
      return observeIntersection(loadMoreIndicatorRef.current, entity => {
        if (entity.isIntersecting && !previousIsIntersecting && hasMore) {
          notificationListService.loadMore();
        }
        previousIsIntersecting = entity.isIntersecting;
      });
    }
    return;
  }, [hasMore, notificationListService]);

  const handleDeleteAll = useCallback(() => {
    notificationListService.readAllNotifications().catch(err => {
      notify.error(UserFriendlyError.fromAny(err));
    });
  }, [notificationListService]);

  return (
    <div
      className={styles.container}
      data-mobile={BUILD_CONFIG.isMobileEdition ? '' : undefined}
    >
      <div className={styles.header}>
        <span>{t['com.affine.rootAppSidebar.notifications']()}</span>
        {notifications.length > 0 && (
          <Menu
            items={
              <MenuItem prefixIcon={<DeleteIcon />} onClick={handleDeleteAll}>
                <span>{t['com.affine.notification.delete-all']()}</span>
              </MenuItem>
            }
          >
            <IconButton icon={<MoreHorizontalIcon />} />
          </Menu>
        )}
      </div>
      <Scrollable.Root className={styles.scrollRoot}>
        <Scrollable.Viewport className={styles.scrollViewport}>
          {notifications.length > 0 ? (
            <ul className={styles.itemList}>
              {notifications.map(notification => (
                <li key={notification.id}>
                  <NotificationItem notification={notification} />
                </li>
              ))}
              {userFriendlyError && (
                <div className={styles.error}>{userFriendlyError.message}</div>
              )}
            </ul>
          ) : isLoading ? (
            <NotificationItemSkeleton />
          ) : userFriendlyError ? (
            <div className={styles.error}>{userFriendlyError.message}</div>
          ) : (
            <NotificationListEmpty />
          )}

          <div
            ref={loadMoreIndicatorRef}
            className={hasMore ? styles.loadMoreIndicator : ''}
          >
            {hasMore ? t['com.affine.notification.loading-more']() : null}
          </div>
        </Scrollable.Viewport>
        <Scrollable.Scrollbar />
      </Scrollable.Root>
    </div>
  );
};

const NotificationListEmpty = () => {
  const t = useI18n();
  return (
    <div className={styles.listEmpty}>
      <div className={styles.listEmptyIconContainer}>
        <NotificationIcon width={24} height={24} />
      </div>
      <div className={styles.listEmptyTitle}>
        {t['com.affine.notification.empty']()}
      </div>
      <div className={styles.listEmptyDescription}>
        {t['com.affine.notification.empty.description']()}
      </div>
    </div>
  );
};

const NotificationItemSkeleton = () => {
  return Array.from({ length: 3 }).map((_, i) => (
    <div
      // oxlint-disable-next-line no-array-index-key
      key={i}
      className={clsx(styles.itemContainer, styles.itemSkeletonContainer)}
      data-disabled="true"
    >
      <Skeleton variant="circular" width={22} height={22} />
      <div className={styles.itemMain}>
        <Skeleton variant="text" width={150} />
        <div className={styles.itemDate}>
          <Skeleton variant="text" width={100} />
        </div>
      </div>
    </div>
  ));
};

const NotificationItem = ({ notification }: { notification: Notification }) => {
  const t = useI18n();
  const type = notification.type;

  return type === NotificationType.Mention ? (
    <MentionNotificationItem notification={notification} />
  ) : type === NotificationType.Comment ? (
    <CommentNotificationItem notification={notification} />
  ) : type === NotificationType.CommentMention ? (
    <CommentMentionNotificationItem notification={notification} />
  ) : type === NotificationType.InvitationAccepted ? (
    <InvitationAcceptedNotificationItem notification={notification} />
  ) : type === NotificationType.Invitation ? (
    <InvitationNotificationItem notification={notification} />
  ) : type === NotificationType.InvitationBlocked ? (
    <InvitationBlockedNotificationItem notification={notification} />
  ) : type === NotificationType.InvitationReviewRequest ? (
    <InvitationReviewRequestNotificationItem notification={notification} />
  ) : type === NotificationType.InvitationReviewDeclined ? (
    <InvitationReviewDeclinedNotificationItem notification={notification} />
  ) : type === NotificationType.InvitationReviewApproved ? (
    <InvitationReviewApprovedNotificationItem notification={notification} />
  ) : (
    <div className={styles.itemContainer}>
      <Avatar size={22} />
      <div className={styles.itemNotSupported}>
        {t['com.affine.notification.unsupported']()} ({type})
      </div>
      <DeleteButton notification={notification} />
    </div>
  );
};

const MentionNotificationItem = ({
  notification,
}: {
  notification: Notification;
}) => {
  const notificationListService = useService(NotificationListService);
  const { jumpToPageBlock } = useNavigateHelper();
  const t = useI18n();
  const body = notification.body as MentionNotificationBodyType;
  const memberInactived = !body.createdByUser;

  const handleClick = useCallback(() => {
    track.$.sidebar.notifications.clickNotification({
      type: notification.type,
      item: 'read',
    });
    if (!body.workspace?.id) {
      return;
    }
    notificationListService.readNotification(notification.id).catch(err => {
      console.error(err);
    });
    jumpToPageBlock(
      body.workspace.id,
      body.doc.id,
      body.doc.mode,
      body.doc.blockId ? [body.doc.blockId] : undefined,
      body.doc.elementId ? [body.doc.elementId] : undefined
    );
  }, [body, jumpToPageBlock, notificationListService, notification]);

  return (
    <div className={styles.itemContainer} onClick={handleClick}>
      <Avatar
        size={22}
        name={body.createdByUser?.name}
        url={body.createdByUser?.avatarUrl}
      />
      <div className={styles.itemMain}>
        <span>
          <Trans
            i18nKey={'com.affine.notification.mention'}
            components={{
              1: (
                <b
                  className={styles.itemNameLabel}
                  data-inactived={memberInactived}
                />
              ),
              2: <DocNameWithIcon mode={body.doc.mode} />,
            }}
            values={{
              username:
                body.createdByUser?.name ?? t['com.affine.inactive-member'](),
              docTitle: body.doc.title || t['Untitled'](),
            }}
          />
        </span>
        <div className={styles.itemDate}>
          {i18nTime(notification.createdAt, {
            relative: true,
          })}
        </div>
      </div>
      <DeleteButton notification={notification} />
    </div>
  );
};

const InvitationReviewRequestNotificationItem = ({
  notification,
}: {
  notification: Notification;
}) => {
  const notificationListService = useService(NotificationListService);
  const { jumpToWorkspaceSettings } = useNavigateHelper();
  const t = useI18n();
  const body = notification.body as InvitationReviewRequestNotificationBodyType;
  const memberInactived = !body.createdByUser;
  const workspaceInactived = !body.workspace;
  const handleClick = useCallback(() => {
    track.$.sidebar.notifications.clickNotification({
      type: notification.type,
      item: 'read',
    });
    notificationListService.readNotification(notification.id).catch(err => {
      console.error(err);
    });
    if (!body.workspace?.id) {
      return;
    }
    jumpToWorkspaceSettings(body.workspace.id, 'workspace:members');
  }, [body, jumpToWorkspaceSettings, notification, notificationListService]);

  return (
    <div className={styles.itemContainer} onClick={handleClick}>
      <Avatar
        size={22}
        name={body.createdByUser?.name}
        url={body.createdByUser?.avatarUrl}
      />
      <div className={styles.itemMain}>
        <span>
          <Trans
            i18nKey={'com.affine.notification.invitation-review-request'}
            components={{
              1: (
                <b
                  className={styles.itemNameLabel}
                  data-inactived={memberInactived}
                />
              ),
              2: <WorkspaceNameWithIcon data-inactived={workspaceInactived} />,
            }}
            values={{
              username:
                body.createdByUser?.name ?? t['com.affine.inactive-member'](),
              workspaceName:
                body.workspace?.name ?? t['com.affine.inactive-workspace'](),
            }}
          />
        </span>
        <div className={styles.itemDate}>
          {i18nTime(notification.createdAt, {
            relative: true,
          })}
        </div>
      </div>
      <DeleteButton notification={notification} />
    </div>
  );
};

const InvitationReviewDeclinedNotificationItem = ({
  notification,
}: {
  notification: Notification;
}) => {
  const t = useI18n();
  const body =
    notification.body as InvitationReviewDeclinedNotificationBodyType;
  const memberInactived = !body.createdByUser;
  const workspaceInactived = !body.workspace;

  return (
    <div className={styles.itemContainer}>
      <Avatar
        size={22}
        name={body.createdByUser?.name}
        url={body.createdByUser?.avatarUrl}
      />
      <div className={styles.itemMain}>
        <span>
          <Trans
            i18nKey={'com.affine.notification.invitation-review-declined'}
            components={{
              1: (
                <b
                  className={styles.itemNameLabel}
                  data-inactived={memberInactived}
                />
              ),
              2: <WorkspaceNameWithIcon data-inactived={workspaceInactived} />,
            }}
            values={{
              username:
                body.createdByUser?.name ?? t['com.affine.inactive-member'](),
              workspaceName:
                body.workspace?.name ?? t['com.affine.inactive-workspace'](),
            }}
          />
        </span>
        <div className={styles.itemDate}>
          {i18nTime(notification.createdAt, {
            relative: true,
          })}
        </div>
      </div>
      <DeleteButton notification={notification} />
    </div>
  );
};

const InvitationReviewApprovedNotificationItem = ({
  notification,
}: {
  notification: Notification;
}) => {
  const notificationListService = useService(NotificationListService);
  const { jumpToPage } = useNavigateHelper();
  const t = useI18n();
  const body =
    notification.body as InvitationReviewApprovedNotificationBodyType;
  const memberInactived = !body.createdByUser;
  const workspaceInactived = !body.workspace;

  const handleClick = useCallback(() => {
    track.$.sidebar.notifications.clickNotification({
      type: notification.type,
      item: 'button',
      button: 'open',
    });
    notificationListService.readNotification(notification.id).catch(err => {
      console.error(err);
    });
    if (!body.workspace?.id) {
      return;
    }
    jumpToPage(body.workspace.id, 'all');
  }, [body, jumpToPage, notification, notificationListService]);

  return (
    <div className={styles.itemContainer}>
      <Avatar
        size={22}
        name={body.createdByUser?.name}
        url={body.createdByUser?.avatarUrl}
      />
      <div className={styles.itemMain}>
        <span>
          <Trans
            i18nKey={'com.affine.notification.invitation-review-approved'}
            components={{
              1: (
                <b
                  className={styles.itemNameLabel}
                  data-inactived={memberInactived}
                />
              ),
              2: <WorkspaceNameWithIcon data-inactived={workspaceInactived} />,
            }}
            values={{
              username:
                body.createdByUser?.name ?? t['com.affine.inactive-member'](),
              workspaceName:
                body.workspace?.name ?? t['com.affine.inactive-workspace'](),
            }}
          />
        </span>
        {!workspaceInactived && (
          <Button
            variant="secondary"
            className={styles.itemActionButton}
            onClick={handleClick}
          >
            {t[
              'com.affine.notification.invitation-review-approved.open-workspace'
            ]()}
          </Button>
        )}
        <div className={styles.itemDate}>
          {i18nTime(notification.createdAt, {
            relative: true,
          })}
        </div>
      </div>
      <DeleteButton notification={notification} />
    </div>
  );
};

const InvitationAcceptedNotificationItem = ({
  notification,
}: {
  notification: Notification;
}) => {
  const notificationListService = useService(NotificationListService);
  const { jumpToWorkspaceSettings } = useNavigateHelper();
  const t = useI18n();
  const body = notification.body as InvitationAcceptedNotificationBodyType;
  const memberInactived = !body.createdByUser;

  const handleClick = useCallback(() => {
    track.$.sidebar.notifications.clickNotification({
      type: notification.type,
      item: 'read',
    });
    notificationListService.readNotification(notification.id).catch(err => {
      console.error(err);
    });
    if (!body.workspace?.id) {
      return;
    }
    jumpToWorkspaceSettings(body.workspace.id, 'workspace:members');
  }, [body, jumpToWorkspaceSettings, notification, notificationListService]);

  return (
    <div className={styles.itemContainer} onClick={handleClick}>
      <Avatar
        size={22}
        name={body.createdByUser?.name}
        url={body.createdByUser?.avatarUrl}
      />
      <div className={styles.itemMain}>
        <span>
          <Trans
            i18nKey={'com.affine.notification.invitation-accepted'}
            components={{
              1: <WorkspaceNameWithIcon data-inactived={memberInactived} />,
            }}
            values={{
              username:
                body.createdByUser?.name ?? t['com.affine.inactive-member'](),
            }}
          />
        </span>
        <div className={styles.itemDate}>
          {i18nTime(notification.createdAt, {
            relative: true,
          })}
        </div>
      </div>
      <DeleteButton notification={notification} />
    </div>
  );
};

const InvitationBlockedNotificationItem = ({
  notification,
}: {
  notification: Notification;
}) => {
  const notificationListService = useService(NotificationListService);
  const { jumpToWorkspaceSettings } = useNavigateHelper();
  const t = useI18n();
  const body = notification.body as InvitationBlockedNotificationBodyType;
  const workspaceInactived = !body.workspace;

  const handleClick = useCallback(() => {
    track.$.sidebar.notifications.clickNotification({
      type: notification.type,
      item: 'read',
    });
    notificationListService.readNotification(notification.id).catch(err => {
      console.error(err);
    });
    if (!body.workspace?.id) {
      return;
    }
    jumpToWorkspaceSettings(body.workspace.id, 'workspace:members');
  }, [body, jumpToWorkspaceSettings, notification, notificationListService]);

  return (
    <div className={styles.itemContainer} onClick={handleClick}>
      <CollaborationIcon width={22} height={22} />
      <div className={styles.itemMain}>
        <span>
          <Trans
            i18nKey={'com.affine.notification.invitation-blocked'}
            components={{
              1: (
                <b
                  className={styles.itemNameLabel}
                  data-inactived={workspaceInactived}
                />
              ),
            }}
            values={{
              workspaceName:
                body.workspace?.name ?? t['com.affine.inactive-workspace'](),
            }}
          />
        </span>
        <div className={styles.itemDate}>
          {i18nTime(notification.createdAt, {
            relative: true,
          })}
        </div>
      </div>
      <DeleteButton notification={notification} />
    </div>
  );
};

const InvitationNotificationItem = ({
  notification,
}: {
  notification: Notification;
}) => {
  const t = useI18n();
  const body = notification.body as InvitationNotificationBodyType;
  const memberInactived = !body.createdByUser;
  const workspaceInactived = !body.workspace;
  const workspacesService = useService(WorkspacesService);
  const invitationService = useService(InvitationService);
  const notificationListService = useService(NotificationListService);
  const inviteId = body.inviteId;
  const [isAccepting, setIsAccepting] = useState(false);
  const { jumpToPage } = useNavigateHelper();

  const handleReadAndOpenWorkspace = useCallback(() => {
    notificationListService.readNotification(notification.id).catch(err => {
      console.error(err);
    });
    if (!body.workspace?.id) {
      return; // should never happen
    }
    jumpToPage(body.workspace.id, 'all');
  }, [body, jumpToPage, notification.id, notificationListService]);

  const handleAcceptInvite = useCallback(() => {
    track.$.sidebar.notifications.clickNotification({
      type: notification.type,
      item: 'button',
      button: 'accept',
    });
    setIsAccepting(true);
    invitationService
      .acceptInvite(inviteId)
      .catch(err => {
        const userFriendlyError = UserFriendlyError.fromAny(err);
        if (userFriendlyError.is('ALREADY_IN_SPACE')) {
          // ignore if the user is already in the workspace
          return true;
        }
        notify.error(userFriendlyError);
        throw err;
      })
      .then(async value => {
        if (value === false) {
          // invite is expired
          notify.error({
            title: t['com.affine.expired.page.title'](),
            message: t['com.affine.expired.page.new-subtitle'](),
          });
          notificationListService
            .readNotification(notification.id)
            .catch(err => {
              console.error(err);
            });
          return;
        } else {
          // invite is accepted
          await workspacesService.list.waitForRevalidation();
          handleReadAndOpenWorkspace();
        }
      })
      .catch(err => {
        const userFriendlyError = UserFriendlyError.fromAny(err);
        notify.error(userFriendlyError);
      })
      .finally(() => {
        setIsAccepting(false);
      });
  }, [
    invitationService,
    handleReadAndOpenWorkspace,
    inviteId,
    notification,
    notificationListService,
    t,
    workspacesService,
  ]);

  return (
    <div className={styles.itemContainer}>
      <Avatar
        size={22}
        name={body.createdByUser?.name}
        url={body.createdByUser?.avatarUrl}
      />
      <div className={styles.itemMain}>
        <span>
          <Trans
            i18nKey={'com.affine.notification.invitation'}
            components={{
              1: (
                <b
                  className={styles.itemNameLabel}
                  data-inactived={memberInactived}
                />
              ),
              2: <WorkspaceNameWithIcon data-inactived={workspaceInactived} />,
            }}
            values={{
              username:
                body.createdByUser?.name ?? t['com.affine.inactive-member'](),
              workspaceName:
                body.workspace?.name ?? t['com.affine.inactive-workspace'](),
            }}
          />
        </span>
        {!workspaceInactived && (
          <Button
            variant="secondary"
            className={styles.itemActionButton}
            onClick={handleAcceptInvite}
            loading={isAccepting}
          >
            {t['com.affine.notification.invitation.accept']()}
          </Button>
        )}
        <div className={styles.itemDate}>
          {i18nTime(notification.createdAt, {
            relative: true,
          })}
        </div>
      </div>
      <DeleteButton notification={notification} />
    </div>
  );
};

const DeleteButton = ({
  notification,
  onClick,
}: {
  notification: Notification;
  onClick?: () => void;
}) => {
  const notificationListService = useService(NotificationListService);

  const handleDelete = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation(); // prevent trigger the click event of the parent element

      track.$.sidebar.notifications.clickNotification({
        type: notification.type,
        item: 'dismiss',
      });

      notificationListService.readNotification(notification.id).catch(err => {
        console.error(err);
      });
      onClick?.();
    },
    [notificationListService, notification, onClick]
  );

  return (
    <IconButton
      size={16}
      className={styles.itemDeleteButton}
      icon={<DeleteIcon />}
      onClick={handleDelete}
    />
  );
};

const WorkspaceNameWithIcon = ({
  children,
  ...props
}: React.PropsWithChildren<React.HTMLAttributes<HTMLSpanElement>>) => {
  return (
    <b className={styles.itemNameLabel} {...props}>
      <CollaborationIcon
        className={styles.itemNameLabelIcon}
        width={20}
        height={20}
      />
      {children}
    </b>
  );
};

const DocNameWithIcon = ({
  children,
  mode,
  ...props
}: React.PropsWithChildren<
  React.HTMLAttributes<HTMLSpanElement> & { mode: 'page' | 'edgeless' }
>) => {
  const { emoji, rest: titleWithoutEmoji } = useMemo(() => {
    if (typeof children === 'string') {
      return extractEmojiIcon(children);
    }
    if (
      children instanceof Array &&
      children.length === 1 &&
      typeof children[0] === 'string'
    ) {
      return extractEmojiIcon(children[0]);
    }
    return { rest: children, emoji: null };
  }, [children]);
  return (
    <b className={styles.itemNameLabel} {...props}>
      {emoji ? (
        <span className={styles.itemNameLabelIcon}>{emoji}</span>
      ) : mode === 'page' ? (
        <PageIcon className={styles.itemNameLabelIcon} width={20} height={20} />
      ) : (
        <EdgelessIcon
          className={styles.itemNameLabelIcon}
          width={20}
          height={20}
        />
      )}
      {titleWithoutEmoji}
    </b>
  );
};

const CommentNotificationItem = ({
  notification,
}: {
  notification: Notification;
}) => {
  const notificationListService = useService(NotificationListService);
  const { jumpToPageComment } = useNavigateHelper();
  const t = useI18n();
  const body = notification.body;

  const memberInactived = !body.createdByUser;

  const handleClick = useCallback(() => {
    track.$.sidebar.notifications.clickNotification({
      type: notification.type,
      item: 'read',
    });
    if (!body.workspaceId || !body.doc?.id) {
      return;
    }
    notificationListService.readNotification(notification.id).catch(err => {
      console.error(err);
    });

    jumpToPageComment(
      body.workspaceId,
      body.doc.id,
      body.commentId,
      body.doc.mode
    );
  }, [body, jumpToPageComment, notificationListService, notification]);

  return (
    <div className={styles.itemContainer} onClick={handleClick}>
      <Avatar
        size={22}
        name={body.createdByUser?.name}
        url={body.createdByUser?.avatarUrl}
      />
      <div className={styles.itemMain}>
        <span>
          <Trans
            i18nKey={'com.affine.notification.comment'}
            components={{
              1: (
                <b
                  className={styles.itemNameLabel}
                  data-inactived={memberInactived}
                />
              ),
              2: <DocNameWithIcon mode={body.doc?.mode || 'page'} />,
            }}
            values={{
              username:
                body.createdByUser?.name ?? t['com.affine.inactive-member'](),
              docTitle: body.doc?.title || t['Untitled'](),
            }}
          />
        </span>
        <div className={styles.itemDate}>
          {i18nTime(notification.createdAt, {
            relative: true,
          })}
        </div>
      </div>
      <DeleteButton notification={notification} />
    </div>
  );
};

const CommentMentionNotificationItem = ({
  notification,
}: {
  notification: Notification;
}) => {
  const notificationListService = useService(NotificationListService);
  const { jumpToPageComment } = useNavigateHelper();
  const t = useI18n();
  const body = notification.body;

  const memberInactived = !body.createdByUser;

  const handleClick = useCallback(() => {
    track.$.sidebar.notifications.clickNotification({
      type: notification.type,
      item: 'read',
    });
    if (!body.workspaceId || !body.doc?.id) {
      return;
    }
    notificationListService.readNotification(notification.id).catch(err => {
      console.error(err);
    });

    jumpToPageComment(
      body.workspaceId,
      body.doc.id,
      body.commentId,
      body.doc.mode
    );
  }, [body, jumpToPageComment, notificationListService, notification]);

  return (
    <div className={styles.itemContainer} onClick={handleClick}>
      <Avatar
        size={22}
        name={body.createdByUser?.name}
        url={body.createdByUser?.avatarUrl}
      />
      <div className={styles.itemMain}>
        <span>
          <Trans
            i18nKey={'com.affine.notification.comment-mention'}
            components={{
              1: (
                <b
                  className={styles.itemNameLabel}
                  data-inactived={memberInactived}
                />
              ),
              2: <DocNameWithIcon mode={body.doc?.mode || 'page'} />,
            }}
            values={{
              username:
                body.createdByUser?.name ?? t['com.affine.inactive-member'](),
              docTitle: body.doc?.title || t['Untitled'](),
            }}
          />
        </span>
        <div className={styles.itemDate}>
          {i18nTime(notification.createdAt, {
            relative: true,
          })}
        </div>
      </div>
      <DeleteButton notification={notification} />
    </div>
  );
};
