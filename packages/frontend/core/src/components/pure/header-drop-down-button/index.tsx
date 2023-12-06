import { IconButton, type IconButtonProps } from '@affine/component/ui/button';
import { ArrowDownSmallIcon } from '@blocksuite/icons';
import { forwardRef } from 'react';

import { headerMenuTrigger } from './styles.css';

export const HeaderDropDownButton = forwardRef<
  HTMLButtonElement,
  Omit<IconButtonProps, 'children'>
>((props, ref) => {
  return (
    <IconButton
      ref={ref}
      {...props}
      data-testid="header-dropDownButton"
      className={headerMenuTrigger}
      withoutHoverStyle={true}
      type="plain"
    >
      <ArrowDownSmallIcon />
    </IconButton>
  );
});

HeaderDropDownButton.displayName = 'HeaderDropDownButton';
