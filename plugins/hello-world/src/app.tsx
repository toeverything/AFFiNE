import { Logo1Icon } from '@blocksuite/icons';
import { IconButton } from '@toeverything/components/button';
import { Tooltip } from '@toeverything/components/tooltip';
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
