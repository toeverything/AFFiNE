import {
  EditIcon,
  LocalDataIcon,
  MoreHorizontalIcon,
  ZoomDownIcon,
  ZoomUpIcon,
} from '@blocksuite/icons/rc';
import { useState } from 'react';

import { IconButton } from '../../ui/button';
import { Menu, MenuItem } from '../../ui/menu';
import * as styles from './styles.css';

export interface TitlebarProps {
  id: string;
  name: string;
  ext: string;
  size: number;
  zoom: number;
}

const items = [
  {
    name: 'Rename',
    icon: <EditIcon />,
    action() {},
  },
  {
    name: 'Download',
    icon: <LocalDataIcon />,
    action() {},
  },
];

export const MenuItems = () =>
  items.map(({ name, icon, action }) => (
    <MenuItem key={name} onClick={action} prefixIcon={icon}>
      {name}
    </MenuItem>
  ));

export const Titlebar = ({ name, ext, size, zoom = 100 }: TitlebarProps) => {
  const [openMenu, setOpenMenu] = useState(false);

  return (
    <div className={styles.titlebar}>
      <div className={styles.titlebarChild}>
        <div className={styles.titlebarName}>
          <div>{name}</div>
          <span>{ext}</span>
        </div>
        <div>{size}MB</div>
        <IconButton icon={<LocalDataIcon />}></IconButton>
        <Menu
          items={<MenuItems />}
          rootOptions={{
            open: openMenu,
            onOpenChange: setOpenMenu,
          }}
          contentOptions={{
            side: 'bottom',
            avoidCollisions: false,
          }}
        >
          <IconButton icon={<MoreHorizontalIcon />}></IconButton>
        </Menu>
      </div>
      <div className={styles.titlebarChild}>
        <IconButton icon={<ZoomDownIcon />}></IconButton>
        <div>{zoom}%</div>
        <IconButton icon={<ZoomUpIcon />}></IconButton>
      </div>
    </div>
  );
};
