import { prefixUrl } from '@affine/env';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { LocalWorkspace } from '@affine/workspace/type';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { useBlockSuiteWorkspacePageIsPublic } from '@toeverything/hooks/use-block-suite-workspace-page-is-public';
import type { FC } from 'react';
import { useState } from 'react';
import { useCallback, useMemo } from 'react';

import { toast } from '../..';
import { PublicLinkDisableModal } from './disable-public-link';
import {
  descriptionStyle,
  inputButtonRowStyle,
  menuItemStyle,
} from './index.css';
import type { ShareMenuProps } from './share-menu';
import {
  StyledButton,
  StyledDisableButton,
  StyledInput,
  StyledLinkSpan,
} from './styles';

export const LocalSharePage: FC<ShareMenuProps> = props => {
  const t = useAFFiNEI18N();
  return (
    <div className={menuItemStyle}>
      <div className={descriptionStyle}>{t['Shared Pages Description']()}</div>
      <StyledButton
        data-testid="share-menu-enable-affine-cloud-button"
        onClick={() => {
          props.onEnableAffineCloud(props.workspace as LocalWorkspace);
        }}
      >
        {t['Enable AFFiNE Cloud']()}
      </StyledButton>
    </div>
  );
};

export const AffineSharePage: FC<ShareMenuProps> = props => {
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
    navigator.clipboard.writeText(sharingUrl);
    toast(t['Copied link to clipboard']());
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
            {t['Create']()}
          </StyledButton>
        )}
        {isPublic && (
          <StyledButton
            data-testid="affine-share-copy-link"
            onClick={onClickCopyLink}
          >
            {t['Copy Link']()}
          </StyledButton>
        )}
      </div>
      <div className={descriptionStyle}>
        <Trans i18nKey="Shared Pages In Public Workspace Description">
          The entire Workspace is published on the web and can be edited via
          <StyledLinkSpan
            onClick={() => {
              props.onOpenWorkspaceSettings(props.workspace);
            }}
          >
            Workspace Settings
          </StyledLinkSpan>
          .
        </Trans>
      </div>
      {isPublic && (
        <>
          <StyledDisableButton onClick={() => setShowDisable(true)}>
            {t['Disable Public Link']()}
          </StyledDisableButton>
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

export const SharePage: FC<ShareMenuProps> = props => {
  if (props.workspace.flavour === WorkspaceFlavour.LOCAL) {
    return <LocalSharePage {...props} />;
  } else if (props.workspace.flavour === WorkspaceFlavour.AFFINE) {
    return <AffineSharePage {...props} />;
  }
  throw new Error('Unreachable');
};
