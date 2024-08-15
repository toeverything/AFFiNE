import { ArrowRightSmallPlusIcon } from '@blocksuite/icons/rc';
import { Slot } from '@radix-ui/react-slot';
import { type MouseEvent, useCallback, useContext } from 'react';

import type { MenuSubProps } from '../menu.types';
import { useMenuItem } from '../use-menu-item';
import { MobileMenuContext } from './context';

export const MobileMenuSub = ({
  children: propsChildren,
  items,
  triggerOptions,
  subContentOptions: contentOptions = {},
}: MenuSubProps) => {
  const {
    className,
    children,
    otherProps: { onClick, ...otherTriggerOptions },
  } = useMenuItem({
    ...triggerOptions,
    children: propsChildren,
    suffixIcon: <ArrowRightSmallPlusIcon />,
  });

  return (
    <MobileMenuSubRaw
      onClick={onClick}
      items={items}
      subContentOptions={contentOptions}
    >
      <div className={className} {...otherTriggerOptions}>
        {children}
      </div>
    </MobileMenuSubRaw>
  );
};

export const MobileMenuSubRaw = ({
  onClick,
  children,
  items,
  subContentOptions: contentOptions = {},
}: MenuSubProps & { onClick?: (e: MouseEvent<HTMLDivElement>) => void }) => {
  const { setSubMenus } = useContext(MobileMenuContext);

  const onItemClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      onClick?.(e);
      setSubMenus(prev => [...prev, { items, contentOptions }]);
    },
    [contentOptions, items, onClick, setSubMenus]
  );

  return <Slot onClick={onItemClick}>{children}</Slot>;
};
