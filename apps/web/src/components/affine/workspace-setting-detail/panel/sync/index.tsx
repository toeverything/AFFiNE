import { Content, FlexWrapper, styled } from '@affine/component';
import { Trans, useTranslation } from '@affine/i18n';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { useBlockSuiteWorkspaceAvatarUrl } from '@toeverything/hooks/use-block-suite-workspace-avatar-url';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import type React from 'react';

import { useCurrentUser } from '../../../../../hooks/current/use-current-user';
import { WorkspaceAvatar } from '../../../../pure/footer';
import type { PanelProps } from '../../index';

export const StyledWorkspaceName = styled('span')(() => {
  return {
    fontWeight: '400',
    fontSize: 'var(--affine-font-h6)',
  };
});

export const SyncPanel: React.FC<PanelProps> = ({ workspace }) => {
  if (workspace.flavour !== WorkspaceFlavour.AFFINE) {
    throw new TypeError('SyncPanel can only be used with Affine workspace');
  }
  const [name] = useBlockSuiteWorkspaceName(workspace.blockSuiteWorkspace);
  const [avatar] = useBlockSuiteWorkspaceAvatarUrl(
    workspace.blockSuiteWorkspace
  );
  const user = useCurrentUser();
  const { t } = useTranslation();
  return (
    <>
      <FlexWrapper alignItems="center" style={{ marginBottom: '12px' }}>
        <WorkspaceAvatar
          size={32}
          name={name}
          avatar={avatar}
          style={{ marginRight: '12px' }}
        />
        <StyledWorkspaceName>{name}</StyledWorkspaceName>
        &nbsp;
        <Content weight={500}>{t('is a Cloud Workspace')}</Content>
      </FlexWrapper>
      <Trans i18nKey="Cloud Workspace Description">
        All data will be synchronised and saved to the AFFiNE account
        {{
          email: user?.email,
        }}
      </Trans>
    </>
  );
};
