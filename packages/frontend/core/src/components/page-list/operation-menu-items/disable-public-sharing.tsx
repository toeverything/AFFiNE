import type { MenuItemProps } from '@affine/component';
import { MenuIcon, MenuItem } from '@affine/component';
import { PublicLinkDisableModal } from '@affine/component/disable-public-link';
import { useI18n } from '@affine/i18n';
import { ShareIcon } from '@blocksuite/icons/rc';

export const DisablePublicSharing = (props: MenuItemProps) => {
  const t = useI18n();
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
