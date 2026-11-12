import { Menu } from '@affine/component';
import { type CSSProperties, type ReactNode } from 'react';

export const DropdownMenu = ({
  items,
  trigger,
  contentStyle,
}: {
  items: ReactNode;
  trigger: ReactNode;
  contentStyle?: CSSProperties;
}) => {
  return (
    <Menu
      items={items}
      contentOptions={{
        style: {
          width: '250px',
          ...contentStyle,
        },
      }}
    >
      {trigger}
    </Menu>
  );
};
