import { Tooltip } from '@affine/component';
import { Logo1Icon } from '@blocksuite/icons';
import { IconButton } from '@toeverything/components/button';
import { useCallback } from 'react';

export const HeaderItem = () => {
  return (
    <Tooltip content="Plugin Enabled">
      <IconButton
        onClick={useCallback(() => {
          console.log('clicked hello world!');
        }, [])}
      >
        <Logo1Icon />
      </IconButton>
    </Tooltip>
  );
};
