import {
  Input,
  RadioButton,
  RadioButtonGroup,
  Switch,
  toast,
} from '@affine/component';
import { PublicLinkDisableModal } from '@affine/component/disable-public-link';
import { Button } from '@affine/component/ui/button';
import { Menu, MenuItem, MenuTrigger } from '@affine/component/ui/menu';
import { useIsSharedPage } from '@affine/core/hooks/affine/use-is-shared-page';
import { useServerBaseUrl } from '@affine/core/hooks/affine/use-server-config';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowRightSmallIcon } from '@blocksuite/icons';
import { useService } from '@toeverything/infra';
import { useLiveData } from '@toeverything/infra';
import { Doc, type PageMode } from '@toeverything/infra';
import { useMemo, useState } from 'react';
import { useCallback } from 'react';

import { CloudSvg } from '../cloud-svg';
import * as styles from './index.css';
import type { ShareMenuProps } from './share-menu';
import { useSharingUrl } from './use-share-url';

export const LocalSharePage = (props: ShareMenuProps) => {
  const t = useAFFiNEI18N();

  return (
    <div className={styles.localSharePage}>
      <div className={styles.columnContainerStyle} style={{ gap: '12px' }}>
        <div className={styles.descriptionStyle} style={{ maxWidth: '230px' }}>
          {t['com.affine.share-menu.EnableCloudDescription']()}
        </div>
        <div>
          <Button
            onClick={props.onEnableAffineCloud}
            type="primary"
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
    currentPage,
  } = props;
  const pageId = currentPage.id;
  const page = useService(Doc);
  const [showDisable, setShowDisable] = useState(false);
  const {
    isSharedPage,
    enableShare,
    changeShare,
    currentShareMode,
    disableShare,
  } = useIsSharedPage(workspaceId, currentPage.id);

  const currentPageMode = useLiveData(page.mode$);

  const defaultMode = useMemo(() => {
    if (isSharedPage) {
      // if it's a shared page, use the share mode
      return currentShareMode;
    }
    // default to  page mode
    return currentPageMode;
  }, [currentPageMode, currentShareMode, isSharedPage]);
  const [mode, setMode] = useState<PageMode>(defaultMode);

  const { sharingUrl, onClickCopyLink } = useSharingUrl({
    workspaceId,
    pageId,
    urlType: 'share',
  });
  const baseUrl = useServerBaseUrl();
  const t = useAFFiNEI18N();

  const onClickCreateLink = useCallback(() => {
    enableShare(mode);
  }, [enableShare, mode]);

  const onDisablePublic = useCallback(() => {
    disableShare();
    toast('Successfully disabled', {
      portal: document.body,
    });
    setShowDisable(false);
  }, [disableShare]);

  const onShareModeChange = useCallback(
    (value: PageMode) => {
      setMode(value);
      if (isSharedPage) {
        changeShare(value);
      }
    },
    [changeShare, isSharedPage]
  );

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
          value={
            (isSharedPage && sharingUrl) ||
            `${
              baseUrl ||
              `${location.protocol}${
                location.port ? `:${location.port}` : ''
              }//${location.hostname}`
            }/...`
          }
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
            type="primary"
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
          <RadioButtonGroup
            className={styles.radioButtonGroup}
            defaultValue={defaultMode}
            value={mode}
            onValueChange={onShareModeChange}
          >
            <RadioButton className={styles.radioButton} value={'page'}>
              {t['com.affine.pageMode.page']()}
            </RadioButton>
            <RadioButton className={styles.radioButton} value={'edgeless'}>
              {t['com.affine.pageMode.edgeless']()}
            </RadioButton>
          </RadioButtonGroup>
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
    return <AffineSharePage {...props} />;
  }
  throw new Error('Unreachable');
};
