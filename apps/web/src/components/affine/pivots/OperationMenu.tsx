import type { PureMenuProps } from '@affine/component';
import { MenuItem, PureMenu } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import {
  CopyIcon,
  DeleteTemporarilyIcon,
  MoveToIcon,
  PenIcon,
  PlusIcon,
} from '@blocksuite/icons';
import type { ReactElement } from 'react';

export type OperationMenuProps = {
  onSelect: (type: OperationMenuItems['type']) => void;
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
  {
    label: 'Move to Trash',
    icon: <DeleteTemporarilyIcon />,
    type: 'delete',
  },
  {
    label: 'Copy Link',
    icon: <CopyIcon />,
    type: 'copy',
    disabled: true,
  },
];
export const OperationMenu = ({
  ...operationMenuProps
}: OperationMenuProps) => {
  const { t } = useTranslation();

  return (
    <PureMenu width={256} {...operationMenuProps}>
      {menuItems.map((item, index) => {
        return (
          <MenuItem
            key={index}
            onClick={() => {
              operationMenuProps.onSelect(item.type);
            }}
            icon={item.icon}
            disabled={!!item.disabled}
          >
            {t(item.label)}
          </MenuItem>
        );
      })}
    </PureMenu>
  );
};
