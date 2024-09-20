import { notify, Skeleton } from '@affine/component';
import { Button } from '@affine/component/ui/button';
import { Menu, MenuItem, MenuTrigger } from '@affine/component/ui/menu';
import { openSettingModalAtom } from '@affine/core/components/atoms';
import {
  getSelectedNodes,
  useSharingUrl,
} from '@affine/core/components/hooks/affine/use-share-url';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { ServerConfigService } from '@affine/core/modules/cloud';
import { EditorService } from '@affine/core/modules/editor';
import { WorkspacePermissionService } from '@affine/core/modules/permissions';
import { ShareInfoService } from '@affine/core/modules/share-doc';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { PublicPageMode } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import type { DocMode } from '@blocksuite/affine/blocks';
import {
  BlockIcon,
  CollaborationIcon,
  DoneIcon,
  EdgelessIcon,
  LockIcon,
  PageIcon,
  SingleSelectSelectSolidIcon,
  ViewIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import { useSetAtom } from 'jotai';
import { Suspense, useCallback, useEffect, useMemo } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { CloudSvg } from '../cloud-svg';
import * as styles from './index.css';
import type { ShareMenuProps } from './share-menu';

export const LocalSharePage = (props: ShareMenuProps) => {
  const t = useI18n();

  return (
    <div className={styles.localSharePage}>
      <div className={styles.columnContainerStyle} style={{ gap: '12px' }}>
        <div className={styles.descriptionStyle} style={{ maxWidth: '230px' }}>
          {t['com.affine.share-menu.EnableCloudDescription']()}
        </div>
        <div>
          <Button
            onClick={props.onEnableAffineCloud}
            variant="primary"
            data-testid="share-menu-enable-affine-cloud-button"
          >
            {t['Enable AFFiNE Cloud']()}
          </Button>
        </div>
      </div>
      <div className={styles.cloudSvgContainer}>
        <CloudSvg />
      </div>
    </div>
  );
};

export const AFFiNESharePage = (props: ShareMenuProps) => {
  const t = useI18n();
  const {
    workspaceMetadata: { id: workspaceId },
  } = props;
  const editor = useService(EditorService).editor;
  const currentMode = useLiveData(editor.mode$);
  const editorContainer = useLiveData(editor.editorContainer$);
  const shareInfoService = useService(ShareInfoService);
  const serverConfig = useService(ServerConfigService).serverConfig;
  useEffect(() => {
    shareInfoService.shareInfo.revalidate();
  }, [shareInfoService]);
  const isSharedPage = useLiveData(shareInfoService.shareInfo.isShared$);
  const sharedMode = useLiveData(shareInfoService.shareInfo.sharedMode$);
  const baseUrl = useLiveData(serverConfig.config$.map(c => c?.baseUrl));
  const isLoading =
    isSharedPage === null || sharedMode === null || baseUrl === null;

  const permissionService = useService(WorkspacePermissionService);
  const isOwner = useLiveData(permissionService.permission.isOwner$);
  const setSettingModalAtom = useSetAtom(openSettingModalAtom);

  const onOpenWorkspaceSettings = useCallback(() => {
    setSettingModalAtom({
      open: true,
      activeTab: 'workspace:preference',
      workspaceMetadata: props.workspaceMetadata,
    });
  }, [props.workspaceMetadata, setSettingModalAtom]);

  const onClickAnyoneReadOnlyShare = useAsyncCallback(async () => {
    if (isSharedPage) {
      return;
    }
    try {
      // TODO(@JimmFly): remove mode when we have a better way to handle it
      await shareInfoService.shareInfo.enableShare(PublicPageMode.Page);
      track.$.sharePanel.$.createShareLink();
      notify.success({
        title:
          t[
            'com.affine.share-menu.create-public-link.notification.success.title'
          ](),
        message:
          t[
            'com.affine.share-menu.create-public-link.notification.success.message'
          ](),
        style: 'normal',
        icon: <SingleSelectSelectSolidIcon color={cssVar('primaryColor')} />,
      });
    } catch (err) {
      notify.error({
        title:
          t[
            'com.affine.share-menu.confirm-modify-mode.notification.fail.title'
          ](),
        message:
          t[
            'com.affine.share-menu.confirm-modify-mode.notification.fail.message'
          ](),
      });
      console.error(err);
    }
  }, [isSharedPage, shareInfoService.shareInfo, t]);

  const onDisablePublic = useAsyncCallback(async () => {
    try {
      await shareInfoService.shareInfo.disableShare();
      notify.error({
        title:
          t[
            'com.affine.share-menu.disable-publish-link.notification.success.title'
          ](),
        message:
          t[
            'com.affine.share-menu.disable-publish-link.notification.success.message'
          ](),
      });
    } catch (err) {
      notify.error({
        title:
          t[
            'com.affine.share-menu.disable-publish-link.notification.fail.title'
          ](),
        message:
          t[
            'com.affine.share-menu.disable-publish-link.notification.fail.message'
          ](),
      });
      console.log(err);
    }
  }, [shareInfoService, t]);

  const { blockIds, elementIds } = useMemo(
    () => getSelectedNodes(editorContainer?.host || null, currentMode),
    [editorContainer, currentMode]
  );
  const { onClickCopyLink } = useSharingUrl({
    workspaceId,
    pageId: editor.doc.id,
  });

  const onCopyPageLink = useCallback(() => {
    onClickCopyLink('page' as DocMode);
  }, [onClickCopyLink]);
  const onCopyEdgelessLink = useCallback(() => {
    onClickCopyLink('edgeless' as DocMode);
  }, [onClickCopyLink]);
  const onCopyBlockLink = useCallback(() => {
    onClickCopyLink(currentMode, blockIds, elementIds);
  }, [currentMode, onClickCopyLink, blockIds, elementIds]);

  if (isLoading) {
    // TODO(@eyhn): loading and error UI
    return (
      <>
        <Skeleton height={100} />
        <Skeleton height={40} />
      </>
    );
  }

  return (
    <div className={styles.content}>
      <div className={styles.titleContainerStyle}>
        {isSharedPage
          ? t['com.affine.share-menu.option.link.readonly.description']()
          : t['com.affine.share-menu.option.link.no-access.description']()}
      </div>
      <div className={styles.columnContainerStyle}>
        <div className={styles.rowContainerStyle}>
          <div className={styles.labelStyle}>
            {t['com.affine.share-menu.option.link.label']()}
          </div>
          <Menu
            contentOptions={{
              align: 'end',
            }}
            items={
              <>
                <MenuItem prefixIcon={<LockIcon />} onSelect={onDisablePublic}>
                  <div className={styles.publicItemRowStyle}>
                    <div>
                      {t['com.affine.share-menu.option.link.no-access']()}
                    </div>
                    {!isSharedPage && (
                      <DoneIcon className={styles.DoneIconStyle} />
                    )}
                  </div>
                </MenuItem>
                <MenuItem
                  prefixIcon={<ViewIcon />}
                  onSelect={onClickAnyoneReadOnlyShare}
                  data-testid="share-link-menu-enable-share"
                >
                  <div className={styles.publicItemRowStyle}>
                    <div>
                      {t['com.affine.share-menu.option.link.readonly']()}
                    </div>
                    {isSharedPage && (
                      <DoneIcon className={styles.DoneIconStyle} />
                    )}
                  </div>
                </MenuItem>
              </>
            }
          >
            <MenuTrigger
              className={styles.menuTriggerStyle}
              data-testid="share-link-menu-trigger"
            >
              {isSharedPage
                ? t['com.affine.share-menu.option.link.readonly']()
                : t['com.affine.share-menu.option.link.no-access']()}
            </MenuTrigger>
          </Menu>
        </div>
        <div className={styles.rowContainerStyle}>
          <div className={styles.labelStyle}>
            {t['com.affine.share-menu.option.permission.label']()}
          </div>
          <Button className={styles.menuTriggerStyle} disabled>
            {t['com.affine.share-menu.option.permission.can-edit']()}
          </Button>
        </div>
      </div>
      {isOwner && (
        <div
          className={styles.openWorkspaceSettingsStyle}
          onClick={onOpenWorkspaceSettings}
        >
          <CollaborationIcon fontSize={16} />
          {t['com.affine.share-menu.navigate.workspace']()}
        </div>
      )}
      <div className={styles.copyLinkContainerStyle}>
        <Button
          className={styles.copyLinkButtonStyle}
          onClick={onCopyBlockLink}
          variant="primary"
          withoutHover
        >
          <span className={styles.copyLinkLabelStyle}>
            {t['com.affine.share-menu.copy']()}
          </span>
          {BUILD_CONFIG.isDesktopEdition && (
            <span className={styles.copyLinkShortcutStyle}>
              {environment.isMacOs ? '⌘ + ⌥ + C' : 'Ctrl + Shift + C'}
            </span>
          )}
        </Button>
        <Menu
          contentOptions={{
            align: 'end',
          }}
          items={
            <>
              <MenuItem
                prefixIcon={<PageIcon />}
                onSelect={onCopyPageLink}
                data-testid="share-link-menu-copy-page"
              >
                {t['com.affine.share-menu.copy.page']()}
              </MenuItem>
              <MenuItem
                prefixIcon={<EdgelessIcon />}
                onSelect={onCopyEdgelessLink}
                data-testid="share-link-menu-copy-edgeless"
              >
                {t['com.affine.share-menu.copy.edgeless']()}
              </MenuItem>
              <MenuItem
                prefixIcon={<BlockIcon />}
                onSelect={onCopyBlockLink}
                disabled={blockIds.length + elementIds.length === 0}
              >
                {t['com.affine.share-menu.copy.block']()}
              </MenuItem>
            </>
          }
        >
          <MenuTrigger
            variant="primary"
            className={styles.copyLinkTriggerStyle}
            data-testid="share-menu-copy-link-button"
            suffixStyle={{ width: 20, height: 20 }}
            withoutHover
          />
        </Menu>
      </div>
    </div>
  );
};

export const SharePage = (props: ShareMenuProps) => {
  if (props.workspaceMetadata.flavour === WorkspaceFlavour.LOCAL) {
    return <LocalSharePage {...props} />;
  } else if (
    props.workspaceMetadata.flavour === WorkspaceFlavour.AFFINE_CLOUD
  ) {
    return (
      // TODO(@eyhn): refactor this part
      <ErrorBoundary fallback={null}>
        <Suspense>
          <AFFiNESharePage {...props} />
        </Suspense>
      </ErrorBoundary>
    );
  }
  throw new Error('Unreachable');
};
