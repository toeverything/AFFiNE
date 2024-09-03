import { Menu } from '@affine/component';
import { type ReactNode } from 'react';

export const DropdownMenu = ({
  items,
  trigger,
}: {
  items: ReactNode;
  trigger: ReactNode;
}) => {
  return (
    <Menu
      items={items}
      contentOptions={{
        style: {
          width: '250px',
        },
      }}
    >
      {trigger}
    </Menu>
  );
};
