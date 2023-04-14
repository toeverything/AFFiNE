import { getEnvironment } from '@affine/env';
import type { LocalWorkspace } from '@affine/workspace/type';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { useBlockSuiteWorkspacePageIsPublic } from '@toeverything/hooks/use-blocksuite-workspace-page-is-public';
import type { FC } from 'react';
import { useState } from 'react';
import { useCallback, useMemo } from 'react';

import { PublicLinkDisableModal } from './disable-public-link';
import {
  descriptionStyle,
  inputButtonRowStyle,
  menuItemStyle,
} from './index.css';
import type { ShareMenuProps } from './ShareMenu';
import {
  StyledButton,
  StyledDisableButton,
  StyledInput,
  StyledLinkSpan,
} from './styles';

export const LocalSharePage: FC<ShareMenuProps> = props => {
  return (
    <div className={menuItemStyle}>
      <div className={descriptionStyle}>
        Sharing page publicly requires AFFiNE Cloud service.
      </div>
      <StyledButton
        data-testid="share-menu-enable-affine-cloud-button"
        onClick={() => {
          props.onEnableAffineCloud(props.workspace as LocalWorkspace);
        }}
      >
        Enable AFFiNE Cloud
      </StyledButton>
    </div>
  );
};

export const AffineSharePage: FC<ShareMenuProps> = props => {
  const [isPublic, setIsPublic] = useBlockSuiteWorkspacePageIsPublic(
    props.currentPage
  );
  const [showDisable, setShowDisable] = useState(false);
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
  }, [setIsPublic]);
  const onClickCopyLink = useCallback(() => {
    navigator.clipboard.writeText(sharingUrl);
  }, [sharingUrl]);

  return (
    <div className={menuItemStyle}>
      <div className={descriptionStyle}>
        Create a link you can easily share with anyone.
      </div>
      <div className={inputButtonRowStyle}>
        <StyledInput
          type="text"
          readOnly
          value={isPublic ? sharingUrl : 'https://app.affine.pro/xxxx'}
        />
        {!isPublic && (
          <StyledButton
            data-testid="affine-share-create-link"
            onClick={onClickCreateLink}
          >
            Create
          </StyledButton>
        )}
        {isPublic && (
          <StyledButton
            data-testid="affine-share-copy-link"
            onClick={onClickCopyLink}
          >
            Copy Link
          </StyledButton>
        )}
      </div>
      <div className={descriptionStyle}>
        The entire Workspace is published on the web and can be edited via
        <StyledLinkSpan
          onClick={() => {
            props.onOpenWorkspaceSettings(props.workspace);
          }}
        >
          Workspace Settings.
        </StyledLinkSpan>
      </div>
      {isPublic && (
        <>
          <StyledDisableButton onClick={() => setShowDisable(true)}>
            Disable Public Link
          </StyledDisableButton>
          <PublicLinkDisableModal
            page={props.currentPage}
            open={showDisable}
            onClose={() => {
              setShowDisable(false);
            }}
          />
        </>
      )}
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
