import { IconButton } from '@affine/component/ui/button';
import { Tooltip } from '@affine/component/ui/tooltip';
import { Logo1Icon } from '@blocksuite/icons';
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
