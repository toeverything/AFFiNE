import { useTranslation } from '@affine/i18n';
import type { AffineWorkspace, LocalWorkspace } from '@affine/workspace/type';
import { WorkspaceFlavour } from '@affine/workspace/type';
import type { FC } from 'react';

import { descriptionStyle, menuItemStyle } from './index.css';
import type { ShareMenuProps } from './ShareMenu';
import { StyledButton } from './styles';

const ShareLocalWorkspace: FC<ShareMenuProps<LocalWorkspace>> = props => {
  const { t } = useTranslation();
  return (
    <div className={menuItemStyle}>
      <div className={descriptionStyle}>
        {t('Share Menu Public Workspace Description1')}
      </div>
      <StyledButton
        data-testid="share-menu-enable-affine-cloud-button"
        onClick={() => {
          props.onOpenWorkspaceSettings(props.workspace);
        }}
      >
        {t('Open Workspace Settings')}
      </StyledButton>
    </div>
  );
};

const ShareAffineWorkspace: FC<ShareMenuProps<AffineWorkspace>> = props => {
  const isPublicWorkspace = props.workspace.public;
  const { t } = useTranslation();
  return (
    <div className={menuItemStyle}>
      <div className={descriptionStyle}>
        {isPublicWorkspace
          ? t('Share Menu Public Workspace Description2')
          : t('Share Menu Public Workspace Description1')}
      </div>
      <StyledButton
        data-testid="share-menu-publish-to-web-button"
        onClick={() => {
          props.onOpenWorkspaceSettings(props.workspace);
        }}
      >
        {t('Open Workspace Settings')}
      </StyledButton>
    </div>
  );
};

export const ShareWorkspace: FC<ShareMenuProps> = props => {
  if (props.workspace.flavour === WorkspaceFlavour.LOCAL) {
    return (
      <ShareLocalWorkspace {...(props as ShareMenuProps<LocalWorkspace>)} />
    );
  } else if (props.workspace.flavour === WorkspaceFlavour.AFFINE) {
    return (
      <ShareAffineWorkspace {...(props as ShareMenuProps<AffineWorkspace>)} />
    );
  }
  throw new Error('Unreachable');
};
