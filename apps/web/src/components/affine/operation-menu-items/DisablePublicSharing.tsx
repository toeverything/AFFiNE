import { MenuItem, styled } from '@affine/component';
import type { PublicLinkDisableProps } from '@affine/component/Share-menu';
import { PublicLinkDisableModal } from '@affine/component/Share-menu';
import { useTranslation } from '@affine/i18n';
import { ShareIcon } from '@blocksuite/icons';

import type { CommonMenuItemProps } from './types';

const StyledMenuItem = styled(MenuItem)(({ theme }) => {
  return {
    div: {
      color: theme.palette.error.main,
      svg: {
        color: theme.palette.error.main,
      },
    },
    ':hover': {
      div: {
        color: theme.palette.error.main,
        svg: {
          color: theme.palette.error.main,
        },
      },
    },
  };
});
export const DisablePublicSharing = ({
  onSelect,
  onItemClick,
  testId,
}: CommonMenuItemProps) => {
  return (
    <>
      <StyledMenuItem
        data-testid={testId}
        onClick={() => {
          onItemClick?.();
          onSelect?.();
        }}
        style={{ color: 'red' }}
        icon={<ShareIcon />}
      >
        Disable Public Sharing
      </StyledMenuItem>
    </>
  );
};

const DisablePublicSharingModal = ({
  pageId,
  open,
  onClose,
}: PublicLinkDisableProps) => {
  const { t } = useTranslation();

  return (
    <PublicLinkDisableModal pageId={pageId} open={open} onClose={onClose} />
  );
};

DisablePublicSharing.DisablePublicSharingModal = DisablePublicSharingModal;
