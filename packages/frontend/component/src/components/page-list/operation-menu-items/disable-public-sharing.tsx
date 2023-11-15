import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ShareIcon } from '@blocksuite/icons';
import {
  MenuIcon,
  MenuItem,
  type MenuItemProps,
} from '@toeverything/components/menu';

import { PublicLinkDisableModal } from '../../disable-public-link';

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
