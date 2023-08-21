import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { WebIcon } from '@blocksuite/icons';
import { Button } from '@toeverything/components/button';
import { useBlockSuiteWorkspacePageIsPublic } from '@toeverything/hooks/use-block-suite-workspace-page-is-public';
import { useState } from 'react';
import { useCallback, useMemo } from 'react';

import { toast } from '../../ui/toast';
import { PublicLinkDisableModal } from './disable-public-link';
import {
  descriptionStyle,
  inputButtonRowStyle,
  menuItemStyle,
} from './index.css';
import * as styles from './index.css';
import type { ShareMenuProps } from './share-menu';

export const LocalSharePage = (props: ShareMenuProps) => {
  return (
    <>
      <div className={styles.titleContainerStyle}>
        <WebIcon fontSize={16} />
        Share Page
      </div>
      <div className={styles.rowContainerStyle}>
        <div className={styles.descriptionStyle}>
          Sharing page publicly requires AFFiNE Cloud service.
        </div>
        <div>
          <Button onClick={props.onEnableAffineCloud} type="primary">
            Enable AFFiNE Cloud
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
    return `${prefixUrl}public-workspace/${props.workspace.id}/${props.currentPage.id}`;
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
    <div className={menuItemStyle}>
      <div className={descriptionStyle}>
        {t['Create Shared Link Description']()}
      </div>
      <div className={inputButtonRowStyle}>
        <input
          type="text"
          readOnly
          value={isPublic ? sharingUrl : 'https://app.affine.pro/xxxx'}
        />
        {!isPublic && (
          <Button
            data-testid="affine-share-create-link"
            onClick={onClickCreateLink}
          >
            {t['Create']()}
          </Button>
        )}
        {isPublic && (
          <Button
            data-testid="affine-share-copy-link"
            onClick={onClickCopyLink}
          >
            {t['Copy Link']()}
          </Button>
        )}
      </div>
      {isPublic && (
        <>
          <button onClick={() => setShowDisable(true)}>
            {t['Disable Public Link']()}
          </button>
          <PublicLinkDisableModal
            open={showDisable}
            onConfirmDisable={onDisablePublic}
            onClose={() => {
              setShowDisable(false);
            }}
          />
        </>
      )}
    </div>
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
