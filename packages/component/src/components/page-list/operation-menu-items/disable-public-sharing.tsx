import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ShareIcon } from '@blocksuite/icons';

import { MenuItem, styled } from '../../../';
import { PublicLinkDisableModal } from '../../share-menu';
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
  ...props
}: CommonMenuItemProps) => {
  const t = useAFFiNEI18N();
  return (
    <>
      <StyledMenuItem
        {...props}
        onClick={() => {
          onItemClick?.();
          onSelect?.();
        }}
        style={{ color: 'red' }}
        icon={<ShareIcon />}
      >
        {t['Disable Public Sharing']()}
      </StyledMenuItem>
    </>
  );
};

DisablePublicSharing.DisablePublicSharingModal = PublicLinkDisableModal;
