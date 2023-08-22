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
import { useBlockSuiteWorkspacePageIsPublic } from '@toeverything/hooks/use-block-suite-workspace-page-is-public';
import { useState } from 'react';
import { useCallback, useMemo } from 'react';

import Input from '../../ui/input';
import { toast } from '../../ui/toast';
import { PublicLinkDisableModal } from './disable-public-link';
import * as styles from './index.css';
import type { ShareMenuProps } from './share-menu';

export const LocalSharePage = (props: ShareMenuProps) => {
  const t = useAFFiNEI18N();
  return (
    <>
      <div className={styles.titleContainerStyle}>
        <WebIcon fontSize={16} />
        {t['com.affine.share-menu.SharePage']()}
      </div>
      <div className={styles.columnContainerStyle}>
        <div className={styles.descriptionStyle}>
          {t['com.affine.share-menu.EnableCloudDescription']()}
        </div>
        <div>
          <Button onClick={props.onEnableAffineCloud} type="primary">
            {t['Enable AFFiNE Cloud']()}
          </Button>
        </div>
      </div>
    </>
  );
};

export const AffineSharePage = (props: ShareMenuProps) => {
  const [isPublic, setIsPublic] = useBlockSuiteWorkspacePageIsPublic(
    props.currentPage
  );
  const [showDisable, setShowDisable] = useState(false);
  const t = useAFFiNEI18N();
  const sharingUrl = useMemo(() => {
    return `/public-workspace/${props.workspace.id}/${props.currentPage.id}`;
  }, [props.workspace.id, props.currentPage.id]);
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
        <WebIcon fontSize={16} />
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
          value={isPublic ? sharingUrl : 'https://app.affine.pro/xxxx'}
          readOnly
        />
        {isPublic ? (
          <Button onClick={onClickCopyLink} style={{ padding: '4px 12px' }}>
            {t.Copy()}
          </Button>
        ) : (
          <Button
            onClick={onClickCreateLink}
            type="primary"
            style={{ padding: '4px 12px' }}
          >
            {t.Create()}
          </Button>
        )}
      </div>
      <div className={styles.rowContainerStyle}>
        <div className={styles.subTitleStyle}>
          {t['com.affine.share-menu.ShareMode']()}
        </div>
        <div
          style={{ display: 'flex', flexGrow: 1, justifyContent: 'flex-end' }}
        >
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
      {isPublic ? (
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
            <div className={styles.subTitleStyle}>Search engine indexing</div>
            <div>
              <Switch />
            </div>
          </div>
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
