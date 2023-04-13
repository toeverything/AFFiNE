import { MenuItem, styled } from '@affine/component';
import type { PublicLinkDisableProps } from '@affine/component/share-menu';
import { PublicLinkDisableModal } from '@affine/component/share-menu';
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
  const { t } = useTranslation();
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
        {t('Disable Public Sharing')}
      </StyledMenuItem>
    </>
  );
};

const DisablePublicSharingModal = ({
  page,
  open,
  onClose,
}: PublicLinkDisableProps) => {
  return <PublicLinkDisableModal page={page} open={open} onClose={onClose} />;
};

DisablePublicSharing.DisablePublicSharingModal = DisablePublicSharingModal;
