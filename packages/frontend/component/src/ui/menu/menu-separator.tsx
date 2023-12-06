import type { MenuSeparatorProps } from '@radix-ui/react-dropdown-menu';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';
import { useMemo } from 'react';

import * as styles from './styles.css';

export const MenuSeparator = ({
  className,
  ...otherProps
}: MenuSeparatorProps) => {
  return (
    <DropdownMenu.Separator
      className={useMemo(
        () => clsx(styles.menuSeparator, className),
        [className]
      )}
      {...otherProps}
    />
  );
};
