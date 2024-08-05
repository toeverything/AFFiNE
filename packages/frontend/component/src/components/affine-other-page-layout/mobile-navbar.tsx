import { IconButton } from '@affine/component/ui/button';
import { Menu, MenuItem } from '@affine/component/ui/menu';
import { CloseIcon, PropertyIcon } from '@blocksuite/icons/rc';
import { useState } from 'react';

import * as styles from './index.css';
import { useNavConfig } from './use-nav-config';

export const MobileNavbar = () => {
  const [openMenu, setOpenMenu] = useState(false);
  const navConfig = useNavConfig();

  const menuItems = (
    <>
      {navConfig.map(item => {
        return (
          <MenuItem
            key={item.title}
            onClick={() => {
              open(item.path, '_blank');
            }}
            className={styles.menuItem}
          >
            {item.title}
          </MenuItem>
        );
      })}
    </>
  );

  return (
    <div className={styles.hideInWideScreen}>
      <Menu
        items={menuItems}
        contentOptions={{
          className: styles.menu,
          sideOffset: 20,
        }}
        rootOptions={{
          open: openMenu,
          onOpenChange: setOpenMenu,
        }}
      >
        <IconButton variant="plain" size="24" className={styles.iconButton}>
          {openMenu ? <CloseIcon /> : <PropertyIcon />}
        </IconButton>
      </Menu>
    </div>
  );
};
