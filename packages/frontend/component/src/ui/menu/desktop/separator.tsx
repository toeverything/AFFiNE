import type { DropdownMenuSeparatorProps } from '@radix-ui/react-dropdown-menu';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';

import * as styles from '../styles.css';

export const DesktopMenuSeparator = ({
  className,
  ...otherProps
}: DropdownMenuSeparatorProps) => {
  return (
    <DropdownMenu.Separator
      className={clsx(styles.menuSeparator, className)}
      {...otherProps}
    />
  );
};
