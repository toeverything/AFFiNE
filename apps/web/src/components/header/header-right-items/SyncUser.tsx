import { LocalWorkspaceIcon, CloudWorkspaceIcon } from '@blocksuite/icons';
import { useAppState } from '@/providers/app-state-provider';
import { displayFlex, styled, Tooltip, IconButton } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { useModal } from '@/store/globalModal';

const IconWrapper = styled.div(() => {
  return {
    width: '32px',
    height: '32px',
    marginRight: '12px',
    fontSize: '22px',
    ...displayFlex('center', 'center'),
  };
});
export const SyncUser = () => {
  const { currentWorkspace } = useAppState();
  const { triggerEnableWorkspaceModal } = useModal();

  const { t } = useTranslation();

  if (currentWorkspace?.provider === 'local') {
    return (
      <Tooltip
        content={t('Saved then enable AFFiNE Cloud')}
        placement="bottom-end"
      >
        <IconButton
          onClick={() => {
            triggerEnableWorkspaceModal();
          }}
          style={{ marginRight: '12px' }}
        >
          <LocalWorkspaceIcon />
        </IconButton>
      </Tooltip>
    );
  }

  return (
    <Tooltip content={t('AFFiNE Cloud')} placement="bottom-end">
      <IconWrapper>
        <CloudWorkspaceIcon />
      </IconWrapper>
    </Tooltip>
  );
};

export default SyncUser;
