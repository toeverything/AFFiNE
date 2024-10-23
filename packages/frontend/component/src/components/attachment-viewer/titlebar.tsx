import type { AttachmentBlockModel } from '@blocksuite/blocks';
import {
  EditIcon,
  LocalDataIcon,
  MoreHorizontalIcon,
  ZoomDownIcon,
  ZoomUpIcon,
} from '@blocksuite/icons/rc';
import clsx from 'clsx';
import { useState } from 'react';

import { IconButton } from '../../ui/button';
import { Menu, MenuItem } from '../../ui/menu';
import * as styles from './styles.css';

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

export interface TitlebarProps {
  model: AttachmentBlockModel;
  name: string;
  ext: string;
  filesize: string;
  isPDF: boolean;
  zoom?: number;
}

export const Titlebar = ({
  model: _,
  name,
  ext,
  filesize,
  zoom = 100,
  isPDF = false,
}: TitlebarProps) => {
  const [openMenu, setOpenMenu] = useState(false);

  return (
    <div className={styles.titlebar}>
      <div className={styles.titlebarChild}>
        <div className={styles.titlebarName}>
          <div>{name}</div>
          <span>.{ext}</span>
        </div>
        <div>{filesize}</div>
        <IconButton icon={<LocalDataIcon />}></IconButton>
        <Menu
          items={<MenuItems />}
          rootOptions={{
            open: openMenu,
            onOpenChange: setOpenMenu,
          }}
          contentOptions={{
            side: 'bottom',
            align: 'center',
            avoidCollisions: false,
          }}
        >
          <IconButton icon={<MoreHorizontalIcon />}></IconButton>
        </Menu>
      </div>
      <div
        className={clsx([
          styles.titlebarChild,
          'zoom',
          {
            show: isPDF,
          },
        ])}
      >
        <IconButton icon={<ZoomDownIcon />}></IconButton>
        <div>{zoom}%</div>
        <IconButton icon={<ZoomUpIcon />}></IconButton>
      </div>
    </div>
  );
};
