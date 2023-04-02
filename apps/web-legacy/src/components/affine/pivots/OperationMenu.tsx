import type { PureMenuProps } from '@affine/component';
import { MenuItem, PureMenu } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { MoveToIcon, PenIcon, PlusIcon } from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import type { ReactElement } from 'react';

import type { BlockSuiteWorkspace } from '../../../shared';
import { CopyLink, MoveToTrash } from '../operation-menu-items';

export type OperationMenuProps = {
  onSelect: (type: OperationMenuItems['type']) => void;
  blockSuiteWorkspace: BlockSuiteWorkspace;
  currentMeta: PageMeta;
} & PureMenuProps;

export type OperationMenuItems = {
  label: string;
  icon: ReactElement;
  type: 'add' | 'move' | 'rename' | 'delete' | 'copy';
  disabled?: boolean;
};

const menuItems: OperationMenuItems[] = [
  {
    label: 'Add a subpage inside',
    icon: <PlusIcon />,
    type: 'add',
  },
  {
    label: 'Move to',
    icon: <MoveToIcon />,
    type: 'move',
  },
  {
    label: 'Rename',
    icon: <PenIcon />,
    type: 'rename',
    disabled: true,
  },
];

export const OperationMenu = ({
  onSelect,
  blockSuiteWorkspace,
  currentMeta,
  ...menuProps
}: OperationMenuProps) => {
  const { t } = useTranslation();

  return (
    <PureMenu width={256} {...menuProps}>
      {menuItems.map((item, index) => {
        return (
          <MenuItem
            key={index}
            onClick={() => {
              onSelect(item.type);
            }}
            icon={item.icon}
            disabled={!!item.disabled}
          >
            {t(item.label)}
          </MenuItem>
        );
      })}
      <MoveToTrash
        currentMeta={currentMeta}
        blockSuiteWorkspace={blockSuiteWorkspace}
      />
      <CopyLink />
    </PureMenu>
  );
};
