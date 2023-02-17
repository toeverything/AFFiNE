import { displayFlex, IconButton, styled, Tooltip } from '@affine/component';
import { WorkspaceUnit } from '@affine/datacenter';
import { useTranslation } from '@affine/i18n';
import { CloudWorkspaceIcon, LocalWorkspaceIcon } from '@blocksuite/icons';
import { useCallback, useEffect, useState } from 'react';

import { useGlobalState } from '@/store/app';
import { useModal } from '@/store/globalModal';

const NoNetWorkIcon = () => {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4.46968 4.46967C4.76257 4.17678 5.23745 4.17678 5.53034 4.46967L19.5303 18.4697C19.8232 18.7626 19.8232 19.2374 19.5303 19.5303C19.2374 19.8232 18.7626 19.8232 18.4697 19.5303L15.1357 16.1963C14.8665 16.3041 14.5474 16.2497 14.3285 16.0325C13.7395 15.4484 12.9163 15.0833 12 15.0833C11.0837 15.0833 10.2606 15.4484 9.67156 16.0325C9.37746 16.3242 8.90259 16.3222 8.61091 16.0281C8.31924 15.734 8.32121 15.2592 8.61531 14.9675C9.47826 14.1117 10.6784 13.5833 12 13.5833C12.1873 13.5833 12.3721 13.5939 12.5539 13.6146L10.3227 11.3833C9.01431 11.6836 7.84393 12.3277 6.91745 13.2107C6.61761 13.4965 6.14287 13.4851 5.8571 13.1852C5.57132 12.8854 5.58273 12.4106 5.88257 12.1249C6.78938 11.2606 7.88809 10.5873 9.11007 10.1707L7.25873 8.31938C6.2455 8.77701 5.31433 9.37678 4.49234 10.092C4.17986 10.3639 3.70613 10.3311 3.43422 10.0186C3.16232 9.7061 3.19521 9.23237 3.50768 8.96047C4.30046 8.27062 5.18228 7.676 6.13421 7.19486L4.46968 5.53033C4.17679 5.23744 4.17679 4.76256 4.46968 4.46967ZM12 7.30556C11.6586 7.30556 11.321 7.32029 10.9877 7.34911C10.575 7.3848 10.2115 7.07919 10.1759 6.66651C10.1402 6.25384 10.4458 5.89037 10.8585 5.85469C11.2347 5.82216 11.6154 5.80556 12 5.80556C15.2588 5.80556 18.2362 6.99725 20.4923 8.96047C20.8048 9.23237 20.8377 9.7061 20.5658 10.0186C20.2939 10.3311 19.8202 10.3639 19.5077 10.092C17.5178 8.3605 14.888 7.30556 12 7.30556ZM15.2321 11.0675C15.4296 10.7034 15.8849 10.5683 16.249 10.7657C16.9333 11.1368 17.5614 11.5949 18.1175 12.1249C18.4173 12.4106 18.4287 12.8854 18.1429 13.1852C17.8571 13.4851 17.3824 13.4965 17.0826 13.2107C16.6223 12.772 16.1017 12.3922 15.5339 12.0843C15.1698 11.8868 15.0347 11.4316 15.2321 11.0675ZM11.25 17.8333C11.25 17.4191 11.5858 17.0833 12 17.0833H12.008C12.4222 17.0833 12.758 17.4191 12.758 17.8333C12.758 18.2475 12.4222 18.5833 12.008 18.5833H12C11.5858 18.5833 11.25 18.2475 11.25 17.8333Z"
      />
    </svg>
  );
};
const IconWrapper = styled.div(() => {
  return {
    width: '32px',
    height: '32px',
    marginRight: '12px',
    fontSize: '22px',
    ...displayFlex('center', 'center'),
  };
});

const getStatus = (workspace: WorkspaceUnit | null) => {
  if (!navigator.onLine) {
    return 'offline';
  }
  if (workspace?.provider === 'local') {
    return 'local';
  }
  return 'cloud';
};
export const SyncUser = () => {
  const currentWorkspace = useGlobalState(
    useCallback(store => store.currentDataCenterWorkspace, [])
  );
  const { triggerEnableWorkspaceModal } = useModal();

  const [status, setStatus] = useState<'offline' | 'local' | 'cloud'>(
    getStatus(currentWorkspace)
  );

  useEffect(() => {
    const online = () => {
      setStatus(getStatus(currentWorkspace));
    };

    const offline = () => {
      setStatus('offline');
    };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [currentWorkspace]);

  const { t } = useTranslation();

  if (status === 'offline') {
    return (
      <Tooltip
        content={t('Please make sure you are online')}
        placement="bottom-end"
      >
        <IconWrapper>
          <NoNetWorkIcon />
        </IconWrapper>
      </Tooltip>
    );
  }

  if (status === 'local') {
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
