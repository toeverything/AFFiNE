import { ArrowRightSmallPlusIcon } from '@blocksuite/icons/rc';
import { Slot } from '@radix-ui/react-slot';
import { type MouseEvent, useCallback, useEffect, useId, useMemo } from 'react';

import type { MenuSubProps } from '../menu.types';
import { useMenuItem } from '../use-menu-item';
import { useMobileSubMenuHelper } from './context';

const EMPTY_SUB_CONTENT_OPTIONS: NonNullable<
  MenuSubProps['subContentOptions']
> = {};

export const MobileMenuSub = ({
  title,
  children: propsChildren,
  items,
  triggerOptions,
  subContentOptions,
}: MenuSubProps & { title?: string }) => {
  const contentOptions = subContentOptions ?? EMPTY_SUB_CONTENT_OPTIONS;
  const {
    className,
    children,
    otherProps: { onClick, textValue: _textValue, ...otherTriggerOptions },
  } = useMenuItem({
    children: propsChildren,
    suffixIcon: <ArrowRightSmallPlusIcon />,
    ...triggerOptions,
  });

  return (
    <MobileMenuSubRaw
      onClick={onClick}
      items={items}
      subContentOptions={contentOptions}
      title={title}
    >
      <button
        type="button"
        className={className}
        disabled={triggerOptions?.disabled}
        {...otherTriggerOptions}
      >
        {children}
      </button>
    </MobileMenuSubRaw>
  );
};

export const MobileMenuSubRaw = ({
  title,
  onClick,
  children,
  items,
  subOptions,
  subContentOptions,
}: MenuSubProps & {
  onClick?: (e: MouseEvent<HTMLElement>) => void;
  title?: string;
}) => {
  const contentOptions = subContentOptions ?? EMPTY_SUB_CONTENT_OPTIONS;
  const id = useId();
  const { addSubMenu } = useMobileSubMenuHelper();

  const subMenuContent = useMemo(
    () => ({ items, contentOptions, options: subOptions, title, id }),
    [items, contentOptions, subOptions, title, id]
  );

  const doAddSubMenu = useCallback(() => {
    addSubMenu(subMenuContent);
  }, [addSubMenu, subMenuContent]);

  const onItemClick = useCallback(
    (e: MouseEvent<HTMLElement>) => {
      onClick?.(e);
      doAddSubMenu();
    },
    [doAddSubMenu, onClick]
  );
  useEffect(() => {
    if (subOptions?.open) {
      doAddSubMenu();
    }
  }, [doAddSubMenu, subOptions]);

  return <Slot onClick={onItemClick}>{children}</Slot>;
};
