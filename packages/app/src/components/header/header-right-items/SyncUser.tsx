import { CloudUnsyncedIcon } from '@blocksuite/icons';
import { useModal } from '@/providers/GlobalModalProvider';
import { useAppState } from '@/providers/app-state-provider';
import { IconButton } from '@affine/component';

// Temporary solution to use this component, since the @blocksuite/icons has not been published yet
const DefaultSyncIcon = () => {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3 13.6493C3 16.6044 5.41766 19 8.4 19L16.5 19C18.9853 19 21 16.9839 21 14.4969C21 12.6503 19.8893 10.9449 18.3 10.25C18.1317 7.32251 15.684 5 12.6893 5C10.3514 5 8.34694 6.48637 7.5 8.5C4.8 8.9375 3 11.2001 3 13.6493Z"
        stroke="#888A9E"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M11.4571 9L9 16H10.4392L12.0021 11.1586L13.5657 16H15L12.5425 9H11.4571Z"
        fill="#888A9E"
      />
    </svg>
  );
};
export const SyncUser = () => {
  const { triggerLoginModal } = useModal();
  const appState = useAppState();

  return appState.user ? (
    <IconButton iconSize="middle" disabled>
      <DefaultSyncIcon />
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
