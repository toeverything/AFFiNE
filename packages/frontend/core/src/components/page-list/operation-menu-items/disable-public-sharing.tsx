import type { MenuItemProps } from '@affine/component';
import { MenuIcon, MenuItem } from '@affine/component';
import { PublicLinkDisableModal } from '@affine/component/disable-public-link';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ShareIcon } from '@blocksuite/icons';

export const DisablePublicSharing = (props: MenuItemProps) => {
  const t = useAFFiNEI18N();
  return (
    <MenuItem
      type="danger"
      preFix={
        <MenuIcon>
          <ShareIcon />
        </MenuIcon>
      }
      {...props}
    >
      {t['Disable Public Sharing']()}
    </MenuItem>
  );
};

DisablePublicSharing.DisablePublicSharingModal = PublicLinkDisableModal;
