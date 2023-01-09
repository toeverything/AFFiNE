import { CloudUnsyncedIcon, CloudInsyncIcon } from '@blocksuite/icons';
import { useModal } from '@/providers/GlobalModalProvider';
import { useAppState } from '@/providers/app-state-provider/context';
import { IconButton } from '@/ui/button';

export const SyncUser = () => {
  const { triggerLoginModal } = useModal();
  const appState = useAppState();

  return appState.user ? (
    <IconButton iconSize="middle" disabled>
      <CloudInsyncIcon />
    </IconButton>
  ) : (
    <IconButton
      iconSize="middle"
      data-testid="cloud-unsync-icon"
      onClick={triggerLoginModal}
    >
      <CloudUnsyncedIcon />
    </IconButton>
  );
};

export default SyncUser;
