import type {
  PopoverContentProps,
  PopoverPortalProps,
  PopoverProps as PopoverPrimitiveProps,
} from '@radix-ui/react-popover';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { useMemo } from 'react';

import * as styles from './styles.css';

export interface PopoverProps extends PopoverPrimitiveProps {
  content?: ReactNode;
  portalOptions?: PopoverPortalProps;
  contentOptions?: PopoverContentProps;
}
export const Popover = ({
  content,
  children,
  portalOptions,
  contentOptions: {
    className: contentClassName,
    style: contentStyle,
    ...otherContentOptions
  } = {},
  ...props
}: PopoverProps) => {
  return (
    <PopoverPrimitive.Root {...props}>
      <PopoverPrimitive.Trigger asChild>{children}</PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal {...portalOptions}>
        <PopoverPrimitive.Content
          className={useMemo(
            () => clsx(styles.popoverContent, contentClassName),
            [contentClassName]
          )}
          sideOffset={5}
          align="start"
          style={{ zIndex: 'var(--affine-z-index-popover)', ...contentStyle }}
          {...otherContentOptions}
        >
          {content}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
};

Popover.displayName = 'Popover';
