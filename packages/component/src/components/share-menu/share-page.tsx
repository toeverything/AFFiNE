import {
  Menu,
  MenuItem,
  MenuTrigger,
  RadioButton,
  RadioButtonGroup,
  Switch,
} from '@affine/component';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowRightSmallIcon, WebIcon } from '@blocksuite/icons';
import { Button } from '@toeverything/components/button';
import { useState } from 'react';
import { useCallback, useMemo } from 'react';

import Input from '../../ui/input';
import { toast } from '../../ui/toast';
import { PublicLinkDisableModal } from './disable-public-link';
import * as styles from './index.css';
import type { ShareMenuProps } from './share-menu';

const CloudSvg = () => (
  <svg
    className={styles.cloudSvgStyle}
    width="193"
    height="108"
    viewBox="0 0 193 108"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g clipPath="url(#clip0_12864_5906)">
      <g opacity="0.1">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M100.707 32.803C82.4182 32.803 67.5923 47.6289 67.5923 65.9176C67.5923 68.4215 67.8692 70.8539 68.3917 73.1882C69.0964 76.3367 67.1162 79.4606 63.9681 80.1667C52.6616 82.7029 44.2173 92.8102 44.2173 104.876C44.2173 118.861 55.5547 130.199 69.5402 130.199H139.665C157.954 130.199 172.78 115.373 172.78 97.0842C172.78 78.7956 157.954 63.9696 139.665 63.9696C139.444 63.9696 139.223 63.9718 139.002 63.9762C136.18 64.0314 133.721 62.0614 133.16 59.2949C130.095 44.179 116.723 32.803 100.707 32.803ZM55.9048 65.9176C55.9048 41.1741 75.9634 21.1155 100.707 21.1155C120.758 21.1155 137.723 34.2825 143.444 52.4393C166.419 54.3582 184.467 73.6135 184.467 97.0842C184.467 121.828 164.409 141.886 139.665 141.886H69.5402C49.0999 141.886 32.5298 125.316 32.5298 104.876C32.5298 89.163 42.3171 75.7471 56.1241 70.3739C55.979 68.9069 55.9048 67.4202 55.9048 65.9176Z"
          fill="var(--affine-icon-color)"
        />
      </g>
    </g>
    <defs>
      <clipPath id="clip0_12864_5906">
        <rect width="193" height="108" fill="white" />
      </clipPath>
    </defs>
  </svg>
);

export const LocalSharePage = (props: ShareMenuProps) => {
  const t = useAFFiNEI18N();
  return (
    <>
      <div className={styles.titleContainerStyle}>
        <div className={styles.shareIconStyle}>
          <WebIcon />
        </div>
        {t['com.affine.share-menu.SharePage']()}
      </div>
      <div className={styles.localSharePage}>
        <div className={styles.columnContainerStyle} style={{ gap: '16px' }}>
          <div className={styles.descriptionStyle}>
            {t['com.affine.share-menu.EnableCloudDescription']()}
          </div>
          <div>
            <Button onClick={props.onEnableAffineCloud} type="primary">
              {t['Enable AFFiNE Cloud']()}
            </Button>
          </div>
        </div>
        <div className={styles.cloudSvgContainer}></div>
        <CloudSvg />
      </div>
    </>
  );
};

export const AffineSharePage = (props: ShareMenuProps) => {
  const {
    workspace: { id: workspaceId },
    currentPage: { id: pageId },
  } = props;
  const [isPublic, setIsPublic] = props.useIsSharedPage(workspaceId, pageId);
  const [showDisable, setShowDisable] = useState(false);
  const t = useAFFiNEI18N();
  const sharingUrl = useMemo(() => {
    return `${runtimeConfig.serverUrlPrefix}/share/${workspaceId}/${pageId}`;
  }, [workspaceId, pageId]);
  const onClickCreateLink = useCallback(() => {
    setIsPublic(true);
  }, [setIsPublic]);
  const onClickCopyLink = useCallback(() => {
    navigator.clipboard
      .writeText(sharingUrl)
      .then(() => {
        toast(t['Copied link to clipboard']());
      })
      .catch(err => {
        console.error(err);
      });
  }, [sharingUrl, t]);
  const onDisablePublic = useCallback(() => {
    setIsPublic(false);
    toast('Successfully disabled', {
      portal: document.body,
    });
  }, [setIsPublic]);

  return (
    <>
      <div className={styles.titleContainerStyle}>
        <div className={styles.shareIconStyle}>
          <WebIcon />
        </div>
        {t['com.affine.share-menu.SharePage']()}
      </div>
      <div className={styles.titleContainerStyle} style={{ fontWeight: '500' }}>
        {t['com.affine.share-menu.ShareWithLink']()}
      </div>
      <div className={styles.columnContainerStyle}>
        <div className={styles.descriptionStyle}>
          {t['com.affine.share-menu.ShareWithLinkDescription']()}
        </div>
      </div>
      <div className={styles.rowContainerStyle}>
        <Input
          inputStyle={{
            color: 'var(--affine-text-secondary-color)',
            fontSize: 'var(--affine-font-xs)',
            lineHeight: '20px',
          }}
          value={isPublic ? sharingUrl : `${runtimeConfig.serverUrlPrefix}/...`}
          readOnly
        />
        {isPublic ? (
          <Button
            onClick={onClickCopyLink}
            data-testid="share-menu-copy-link-button"
            style={{ padding: '4px 12px' }}
          >
            {t.Copy()}
          </Button>
        ) : (
          <Button
            onClick={onClickCreateLink}
            type="primary"
            data-testid="share-menu-create-link-button"
            style={{ padding: '4px 12px' }}
          >
            {t.Create()}
          </Button>
        )}
      </div>
      {runtimeConfig.enableEnhanceShareMode ? (
        <div className={styles.rowContainerStyle}>
          <div className={styles.subTitleStyle}>
            {t['com.affine.share-menu.ShareMode']()}
          </div>
          <div>
            <RadioButtonGroup
              className={styles.radioButtonGroup}
              defaultValue={'page'}
              onValueChange={() => {}}
            >
              <RadioButton
                className={styles.radioButton}
                value={'page'}
                spanStyle={styles.spanStyle}
              >
                {t['Page']()}
              </RadioButton>
              <RadioButton
                className={styles.radioButton}
                value={'edgeless'}
                spanStyle={styles.spanStyle}
              >
                {t['Edgeless']()}
              </RadioButton>
            </RadioButtonGroup>
          </div>
        </div>
      ) : null}
      {isPublic ? (
        <>
          {runtimeConfig.enableEnhanceShareMode && (
            <>
              <div className={styles.rowContainerStyle}>
                <div className={styles.subTitleStyle}>Link expires</div>
                <div>
                  <Menu
                    content={<MenuItem>Never</MenuItem>}
                    placement="bottom-end"
                    trigger="click"
                  >
                    <MenuTrigger
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '4px 6px 4px 10px',
                      }}
                    >
                      Never
                    </MenuTrigger>
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
          <div
            className={styles.rowContainerStyle}
            onClick={() => setShowDisable(true)}
            style={{ cursor: 'pointer' }}
          >
            <div className={styles.disableSharePage}>
              {t['Disable Public Link']()}
            </div>
            <ArrowRightSmallIcon />
          </div>
          <PublicLinkDisableModal
            open={showDisable}
            onConfirmDisable={onDisablePublic}
            onClose={() => {
              setShowDisable(false);
            }}
          />
        </>
      ) : null}
    </>
  );
};

export const SharePage = (props: ShareMenuProps) => {
  if (props.workspace.flavour === WorkspaceFlavour.LOCAL) {
    return <LocalSharePage {...props} />;
  } else if (props.workspace.flavour === WorkspaceFlavour.AFFINE_CLOUD) {
    return <AffineSharePage {...props} />;
  }
  throw new Error('Unreachable');
};
