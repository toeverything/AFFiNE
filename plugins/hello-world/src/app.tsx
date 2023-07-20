import { IconButton, Tooltip } from '@affine/component';
import { AffineLogoSBlue2_1Icon } from '@blocksuite/icons';
import { useCallback } from 'react';

export const HeaderItem = () => {
  return (
    <Tooltip content="Plugin Enabled">
      <IconButton
        onClick={useCallback(() => {
          console.log('clicked hello world!');
        }, [])}
      >
        <AffineLogoSBlue2_1Icon />
      </IconButton>
    </Tooltip>
  );
};
