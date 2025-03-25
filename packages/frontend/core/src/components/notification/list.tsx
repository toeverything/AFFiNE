import {
  Avatar,
  Button,
  IconButton,
  notify,
  Scrollable,
  Skeleton,
} from '@affine/component';
import { AcceptInviteService } from '@affine/core/modules/cloud';
import {
  type Notification,
  NotificationListService,
  NotificationType,
} from '@affine/core/modules/notification';
import { WorkspacesService } from '@affine/core/modules/workspace';
import { UserFriendlyError } from '@affine/error';
import type {
  InvitationAcceptedNotificationBodyType,
  InvitationBlockedNotificationBodyType,
  InvitationNotificationBodyType,
  MentionNotificationBodyType,
} from '@affine/graphql';
import { i18nTime, Trans, useI18n } from '@affine/i18n';
import { CollaborationIcon, DeleteIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useNavigateHelper } from '../hooks/use-navigate-helper';
import * as styles from './list.style.css';

export const NotificationList = () => {
  const t = useI18n();
  const notificationListService = useService(NotificationListService);
  const notifications = useLiveData(notificationListService.notifications$);
  const isLoading = useLiveData(notificationListService.isLoading$);
  const error = useLiveData(notificationListService.error$);

  const userFriendlyError = useMemo(() => {
    return error && UserFriendlyError.fromAny(error);
  }, [error]);

  useEffect(() => {
    // reset the notification list when the component is mounted
    notificationListService.reset();
    notificationListService.loadMore();
  }, [notificationListService]);

  const handleScrollEnd = useCallback(() => {
    notificationListService.loadMore();
  }, [notificationListService]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      if (target.scrollHeight - target.scrollTop <= target.clientHeight + 1) {
        handleScrollEnd();
      }
    },
    [handleScrollEnd]
  );

  return (
    <Scrollable.Root>
      <Scrollable.Viewport
        className={styles.containerScrollViewport}
        onScroll={handleScroll}
      >
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
          <div className={styles.listEmpty}>
            {t['com.affine.notification.empty']()}
          </div>
        )}
      </Scrollable.Viewport>
      <Scrollable.Scrollbar />
    </Scrollable.Root>
  );
};

const NotificationItemSkeleton = () => {
  return Array.from({ length: 3 }).map((_, i) => (
    // oxlint-disable-next-line no-array-index-key
    <div key={i} className={styles.itemContainer} data-disabled="true">
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
  ) : type === NotificationType.InvitationAccepted ? (
    <InvitationAcceptedNotificationItem notification={notification} />
  ) : type === NotificationType.Invitation ? (
    <InvitationNotificationItem notification={notification} />
  ) : type === NotificationType.InvitationBlocked ? (
    <InvitationBlockedNotificationItem notification={notification} />
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
  }, [body, jumpToPageBlock, notificationListService, notification.id]);

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
              2: <b className={styles.itemNameLabel} />,
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
              1: (
                <b
                  className={styles.itemNameLabel}
                  data-inactived={memberInactived}
                />
              ),
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
  const acceptInviteService = useService(AcceptInviteService);
  const notificationListService = useService(NotificationListService);
  const inviteId = body.inviteId;
  const [isAccepting, setIsAccepting] = useState(false);
  const { jumpToPage } = useNavigateHelper();

  const WorkspaceNameWithIcon = useCallback(
    ({
      children,
      ...props
    }: React.PropsWithChildren<React.HTMLAttributes<HTMLSpanElement>>) => {
      return (
        <b className={styles.itemNameLabel} {...props}>
          <CollaborationIcon width={20} height={20} />
          {children}
        </b>
      );
    },
    []
  );

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
    setIsAccepting(true);
    acceptInviteService
      .waitForAcceptInvite(inviteId)
      .catch(err => {
        const userFriendlyError = UserFriendlyError.fromAny(err);
        if (userFriendlyError.is('ALREADY_IN_SPACE')) {
          // ignore if the user is already in the workspace
          return true;
        }
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
    acceptInviteService,
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

      notificationListService.readNotification(notification.id).catch(err => {
        console.error(err);
      });
      onClick?.();
    },
    [notificationListService, notification.id, onClick]
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
