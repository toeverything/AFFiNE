import { IconButton, Menu, MenuItem } from '@affine/component';
import type { AttachmentBlockModel } from '@blocksuite/affine/model';
import {
  //EditIcon,
  LocalDataIcon,
  MoreHorizontalIcon,
  ZoomDownIcon,
  ZoomUpIcon,
} from '@blocksuite/icons/rc';
import clsx from 'clsx';
import { useState } from 'react';

import { download } from './utils';
import * as styles from './viewer.css';

const items = [
  /*
  {
    name: 'Rename',
    icon: <EditIcon />,
    action(_model: AttachmentBlockModel) {},
  },
  */
  {
    name: 'Download',
    icon: <LocalDataIcon />,
    action: download,
  },
];

export const MenuItems = ({ model }: { model: AttachmentBlockModel }) =>
  items.map(({ name, icon, action }) => (
    <MenuItem
      key={name}
      onClick={() => {
        action(model).catch(console.error);
      }}
      prefixIcon={icon}
    >
      {name}
    </MenuItem>
  ));

export interface TitlebarProps {
  model: AttachmentBlockModel;
  name: string;
  ext: string;
  size: string;
  zoom?: number;
}

export const Titlebar = ({
  model,
  name,
  ext,
  size,
  zoom = 100,
}: TitlebarProps) => {
  const [openMenu, setOpenMenu] = useState(false);

  return (
    <div className={styles.titlebar}>
      <div className={styles.titlebarChild}>
        <div className={styles.titlebarName}>
          <div>{name}</div>
          <span>.{ext}</span>
        </div>
        <div>{size}</div>
        <IconButton
          icon={<LocalDataIcon />}
          onClick={() => {
            download(model).catch(console.error);
          }}
        ></IconButton>
        <Menu
          items={<MenuItems model={model} />}
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
            show: false,
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
