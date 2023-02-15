import { LocalWorkspaceIcon, CloudWorkspaceIcon } from '@blocksuite/icons';
import { useAppState } from '@/providers/app-state-provider';
import { styled, Tooltip } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { useModal } from '@/store/globalModal';

const IconWrapper = styled.div(() => {
  return {
    width: '20px',
    height: '20px',
    marginRight: '12px',
    fontSize: '20px',
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
        <IconWrapper
          onClick={() => {
            triggerEnableWorkspaceModal();
          }}
          style={{ cursor: 'pointer' }}
        >
          <LocalWorkspaceIcon />
        </IconWrapper>
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
