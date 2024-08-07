import { Input, notify, RadioGroup, Skeleton, Switch } from '@affine/component';
import { PublicLinkDisableModal } from '@affine/component/disable-public-link';
import { Button } from '@affine/component/ui/button';
import { Menu, MenuItem, MenuTrigger } from '@affine/component/ui/menu';
import { useSharingUrl } from '@affine/core/hooks/affine/use-share-url';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { track } from '@affine/core/mixpanel';
import { ServerConfigService } from '@affine/core/modules/cloud';
import { ShareService } from '@affine/core/modules/share-doc';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { PublicPageMode } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import {
  ArrowRightSmallIcon,
  SingleSelectSelectSolidIcon,
} from '@blocksuite/icons/rc';
import {
  type DocMode,
  DocService,
  useLiveData,
  useService,
} from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import { Suspense, useEffect, useMemo, useState } from 'react';
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

export const AffineSharePage = (props: ShareMenuProps) => {
  const {
    workspaceMetadata: { id: workspaceId },
  } = props;
  const doc = useService(DocService).doc;
  const shareService = useService(ShareService);
  const serverConfig = useService(ServerConfigService).serverConfig;
  useEffect(() => {
    shareService.share.revalidate();
  }, [shareService]);
  const isSharedPage = useLiveData(shareService.share.isShared$);
  const sharedMode = useLiveData(shareService.share.sharedMode$);
  const baseUrl = useLiveData(serverConfig.config$.map(c => c?.baseUrl));
  const isLoading =
    isSharedPage === null || sharedMode === null || baseUrl === null;
  const [showDisable, setShowDisable] = useState(false);

  const currentDocMode = useLiveData(doc.mode$);

  const mode = useMemo(() => {
    if (isSharedPage && sharedMode) {
      // if it's a shared page, use the share mode
      return sharedMode.toLowerCase() as DocMode;
    }
    // default to  page mode
    return currentDocMode;
  }, [currentDocMode, isSharedPage, sharedMode]);

  const { sharingUrl, onClickCopyLink } = useSharingUrl({
    workspaceId,
    pageId: doc.id,
    urlType: 'share',
  });

  const t = useI18n();

  const modeOptions = useMemo(
    () => [
      { value: 'page', label: t['com.affine.pageMode.page']() },
      {
        value: 'edgeless',
        label: t['com.affine.pageMode.edgeless'](),
      },
    ],
    [t]
  );

  const onClickCreateLink = useAsyncCallback(async () => {
    try {
      await shareService.share.enableShare(
        mode === 'edgeless' ? PublicPageMode.Edgeless : PublicPageMode.Page
      );
      track.$.sharePanel.$.createShareLink({
        mode,
      });
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
      if (sharingUrl) {
        navigator.clipboard.writeText(sharingUrl).catch(err => {
          console.error(err);
        });
      }
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
  }, [mode, shareService.share, sharingUrl, t]);

  const onDisablePublic = useAsyncCallback(async () => {
    try {
      await shareService.share.disableShare();
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
    setShowDisable(false);
  }, [shareService, t]);

  const onShareModeChange = useAsyncCallback(
    async (value: DocMode) => {
      try {
        if (isSharedPage) {
          await shareService.share.changeShare(
            value === 'edgeless' ? PublicPageMode.Edgeless : PublicPageMode.Page
          );
          notify.success({
            title:
              t[
                'com.affine.share-menu.confirm-modify-mode.notification.success.title'
              ](),
            message: t[
              'com.affine.share-menu.confirm-modify-mode.notification.success.message'
            ]({
              preMode: value === 'edgeless' ? t['Page']() : t['Edgeless'](),
              currentMode: value === 'edgeless' ? t['Edgeless']() : t['Page'](),
            }),
            style: 'normal',
            icon: (
              <SingleSelectSelectSolidIcon color={cssVar('primaryColor')} />
            ),
          });
        }
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
    },
    [isSharedPage, shareService.share, t]
  );

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
    <>
      <div className={styles.titleContainerStyle}>
        {t['com.affine.share-menu.publish-to-web']()}
      </div>
      <div className={styles.columnContainerStyle}>
        <div className={styles.descriptionStyle}>
          {t['com.affine.share-menu.publish-to-web.description']()}
        </div>
      </div>
      <div className={styles.rowContainerStyle}>
        <Input
          inputStyle={{
            color: 'var(--affine-text-secondary-color)',
            fontSize: 'var(--affine-font-xs)',
            lineHeight: '20px',
          }}
          value={(isSharedPage && sharingUrl) || `${baseUrl}/...`}
          readOnly
        />
        {isSharedPage ? (
          <Button
            onClick={onClickCopyLink}
            data-testid="share-menu-copy-link-button"
            style={{ padding: '4px 12px', whiteSpace: 'nowrap' }}
            disabled={!sharingUrl}
          >
            {t.Copy()}
          </Button>
        ) : (
          <Button
            onClick={onClickCreateLink}
            variant="primary"
            data-testid="share-menu-create-link-button"
            style={{ padding: '4px 12px', whiteSpace: 'nowrap' }}
          >
            {t.Create()}
          </Button>
        )}
      </div>
      <div className={styles.rowContainerStyle}>
        <div className={styles.subTitleStyle}>
          {t['com.affine.share-menu.ShareMode']()}
        </div>
        <div>
          <RadioGroup
            className={styles.radioButtonGroup}
            value={mode}
            onChange={onShareModeChange}
            items={modeOptions}
          />
        </div>
      </div>
      {isSharedPage ? (
        <>
          {runtimeConfig.enableEnhanceShareMode && (
            <>
              <div className={styles.rowContainerStyle}>
                <div className={styles.subTitleStyle}>Link expires</div>
                <div>
                  <Menu items={<MenuItem>Never</MenuItem>}>
                    <MenuTrigger>Never</MenuTrigger>
                  </Menu>
                </div>
              </div>
              <div className={styles.rowContainerStyle}>
                <div className={styles.subTitleStyle}>
                  {'Show "Created with AFFiNE"'}
                </div>
                <div>
                  <Switch />
                </div>
              </div>
              <div className={styles.rowContainerStyle}>
                <div className={styles.subTitleStyle}>
                  Search engine indexing
                </div>
                <div>
                  <Switch />
                </div>
              </div>
            </>
          )}
          <MenuItem
            endFix={<ArrowRightSmallIcon />}
            block
            type="danger"
            className={styles.menuItemStyle}
            onSelect={e => {
              e.preventDefault();
              setShowDisable(true);
            }}
          >
            <div className={styles.disableSharePage}>
              {t['Disable Public Link']()}
            </div>
          </MenuItem>
          <PublicLinkDisableModal
            open={showDisable}
            onConfirm={onDisablePublic}
            onOpenChange={setShowDisable}
          />
        </>
      ) : null}
    </>
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
          <AffineSharePage {...props} />
        </Suspense>
      </ErrorBoundary>
    );
  }
  throw new Error('Unreachable');
};
