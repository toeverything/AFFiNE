import type { DropdownMenuSeparatorProps } from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';

import * as styles from '../styles.css';

export const MobileMenuSeparator = ({
  className,
  style,
}: DropdownMenuSeparatorProps) => {
  return (
    <div className={clsx(styles.menuSeparator, className)} style={style} />
  );
};
