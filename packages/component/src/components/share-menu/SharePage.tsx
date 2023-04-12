import { getEnvironment } from '@affine/env';
import type { LocalWorkspace } from '@affine/workspace/type';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { useBlockSuiteWorkspacePageIsPublic } from '@toeverything/hooks/use-blocksuite-workspace-page-is-public';
import type { FC } from 'react';
import { useCallback, useMemo } from 'react';

import { Button } from '../..';
import type { ShareMenuProps } from './index';
import { buttonStyle, descriptionStyle, menuItemStyle } from './index.css';

export const LocalSharePage: FC<ShareMenuProps> = props => {
  return (
    <div className={menuItemStyle}>
      <div className={descriptionStyle}>
        Sharing page publicly requires AFFiNE Cloud service.
      </div>
      <Button
        data-testid="share-menu-enable-affine-cloud-button"
        className={buttonStyle}
        type="light"
        shape="round"
        onClick={() => {
          props.onEnableAffineCloud(props.workspace as LocalWorkspace);
        }}
      >
        Enable AFFiNE Cloud
      </Button>
    </div>
  );
};

export const AffineSharePage: FC<ShareMenuProps> = props => {
  const [isPublic, setIsPublic] = useBlockSuiteWorkspacePageIsPublic(
    props.currentPage
  );
  const sharingUrl = useMemo(() => {
    const env = getEnvironment();
    if (env.isBrowser) {
      return `${env.origin}/public-workspace/${props.workspace.id}/${props.currentPage.id}`;
    } else {
      return '';
    }
  }, [props.workspace.id, props.currentPage.id]);
  const onClickCreateLink = useCallback(() => {
    setIsPublic(true);
  }, [isPublic]);
  const onClickCopyLink = useCallback(() => {
    navigator.clipboard.writeText(sharingUrl);
  }, []);
  return (
    <div className={menuItemStyle}>
      <div className={descriptionStyle}>
        Create a link you can easily share with anyone.
      </div>
      <span>{isPublic ? sharingUrl : 'not public'}</span>
      {!isPublic && <Button onClick={onClickCreateLink}>Create</Button>}
      {isPublic && <Button onClick={onClickCopyLink}>Copy Link</Button>}
    </div>
  );
};

export const SharePage: FC<ShareMenuProps> = props => {
  if (props.workspace.flavour === WorkspaceFlavour.LOCAL) {
    return <LocalSharePage {...props} />;
  } else if (props.workspace.flavour === WorkspaceFlavour.AFFINE) {
    return <AffineSharePage {...props} />;
  }
  throw new Error('Unreachable');
};
