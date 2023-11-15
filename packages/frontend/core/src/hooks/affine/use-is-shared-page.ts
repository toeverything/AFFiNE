import { pushNotificationAtom } from '@affine/component/notification-center';
import {
  getWorkspacePublicPagesQuery,
  PublicPageMode,
  publishPageMutation,
  revokePublicPageMutation,
} from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useMutation, useQuery } from '@affine/workspace/affine/gql';
import { useSetAtom } from 'jotai';
import { useCallback, useMemo } from 'react';

import type { PageMode } from '../../atoms';

type NoParametersKeys<T> = {
  [K in keyof T]: T[K] extends () => any ? K : never;
}[keyof T];

type i18nKey = NoParametersKeys<ReturnType<typeof useAFFiNEI18N>>;

type NotificationKey =
  | 'enableSuccessTitle'
  | 'enableSuccessMessage'
  | 'enableErrorTitle'
  | 'enableErrorMessage'
  | 'changeSuccessTitle'
  | 'changeErrorTitle'
  | 'changeErrorMessage'
  | 'disableSuccessTitle'
  | 'disableSuccessMessage'
  | 'disableErrorTitle'
  | 'disableErrorMessage';

const notificationToI18nKey: Record<NotificationKey, i18nKey> = {
  enableSuccessTitle:
    'com.affine.share-menu.create-public-link.notification.success.title',
  enableSuccessMessage:
    'com.affine.share-menu.create-public-link.notification.success.message',
  enableErrorTitle:
    'com.affine.share-menu.create-public-link.notification.fail.title',
  enableErrorMessage:
    'com.affine.share-menu.create-public-link.notification.fail.message',
  changeSuccessTitle:
    'com.affine.share-menu.confirm-modify-mode.notification.success.title',
  changeErrorTitle:
    'com.affine.share-menu.confirm-modify-mode.notification.fail.title',
  changeErrorMessage:
    'com.affine.share-menu.confirm-modify-mode.notification.fail.message',
  disableSuccessTitle:
    'com.affine.share-menu.disable-publish-link.notification.success.title',
  disableSuccessMessage:
    'com.affine.share-menu.disable-publish-link.notification.success.message',
  disableErrorTitle:
    'com.affine.share-menu.disable-publish-link.notification.fail.title',
  disableErrorMessage:
    'com.affine.share-menu.disable-publish-link.notification.fail.message',
};

export function useIsSharedPage(
  workspaceId: string,
  pageId: string
): {
  isSharedPage: boolean;
  changeShare: (mode: PageMode) => void;
  disableShare: () => void;
  currentShareMode: PageMode;
  enableShare: (mode: PageMode) => void;
} {
  const t = useAFFiNEI18N();
  const pushNotification = useSetAtom(pushNotificationAtom);
  const { data, mutate } = useQuery({
    query: getWorkspacePublicPagesQuery,
    variables: {
      workspaceId,
    },
  });

  const { trigger: enableSharePage } = useMutation({
    mutation: publishPageMutation,
  });
  const { trigger: disableSharePage } = useMutation({
    mutation: revokePublicPageMutation,
  });

  const [isSharedPage, currentShareMode] = useMemo(() => {
    const publicPage = data?.workspace.publicPages.find(
      publicPage => publicPage.id === pageId
    );
    const isPageShared = !!publicPage;

    const currentShareMode: PageMode =
      publicPage?.mode === PublicPageMode.Edgeless ? 'edgeless' : 'page';

    return [isPageShared, currentShareMode];
  }, [data?.workspace.publicPages, pageId]);

  const enableShare = useCallback(
    (mode: PageMode) => {
      const publishMode =
        mode === 'edgeless' ? PublicPageMode.Edgeless : PublicPageMode.Page;

      enableSharePage({ workspaceId, pageId, mode: publishMode })
        .then(() => {
          pushNotification({
            title: t[notificationToI18nKey['enableSuccessTitle']](),
            message: t[notificationToI18nKey['enableSuccessMessage']](),
            type: 'success',
            theme: 'default',
          });
          return mutate();
        })
        .catch(e => {
          pushNotification({
            title: t[notificationToI18nKey['enableErrorTitle']](),
            message: t[notificationToI18nKey['enableErrorMessage']](),
            type: 'error',
          });
          console.error(e);
        });
    },
    [enableSharePage, mutate, pageId, pushNotification, t, workspaceId]
  );

  const changeShare = useCallback(
    (mode: PageMode) => {
      const publishMode =
        mode === 'edgeless' ? PublicPageMode.Edgeless : PublicPageMode.Page;

      enableSharePage({ workspaceId, pageId, mode: publishMode })
        .then(() => {
          pushNotification({
            title: t[notificationToI18nKey['changeSuccessTitle']](),
            message: t[
              'com.affine.share-menu.confirm-modify-mode.notification.success.message'
            ]({
              preMode:
                publishMode === PublicPageMode.Edgeless
                  ? PublicPageMode.Page
                  : PublicPageMode.Edgeless,
              currentMode: publishMode,
            }),
            type: 'success',
            theme: 'default',
          });
          return mutate();
        })
        .catch(e => {
          pushNotification({
            title: t[notificationToI18nKey['changeErrorTitle']](),
            message: t[notificationToI18nKey['changeErrorMessage']](),
            type: 'error',
          });
          console.error(e);
        });
    },
    [enableSharePage, mutate, pageId, pushNotification, t, workspaceId]
  );

  const disableShare = useCallback(() => {
    disableSharePage({ workspaceId, pageId })
      .then(() => {
        pushNotification({
          title: t[notificationToI18nKey['disableSuccessTitle']](),
          message: t[notificationToI18nKey['disableSuccessMessage']](),
          type: 'success',
          theme: 'default',
        });
        return mutate();
      })
      .catch(e => {
        pushNotification({
          title: t[notificationToI18nKey['disableErrorTitle']](),
          message: t[notificationToI18nKey['disableErrorMessage']](),
          type: 'error',
        });
        console.error(e);
      });
  }, [disableSharePage, mutate, pageId, pushNotification, t, workspaceId]);

  return useMemo(
    () => ({
      isSharedPage,
      currentShareMode,
      enableShare,
      disableShare,
      changeShare,
    }),
    [isSharedPage, currentShareMode, enableShare, disableShare, changeShare]
  );
}
