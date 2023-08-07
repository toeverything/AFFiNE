import { IconButton, Tooltip } from '@affine/component';
import { contentLayoutAtom } from '@affine/sdk/entry';
import { AiIcon } from '@blocksuite/icons';
import { useSetAtom } from 'jotai';
import type { ReactElement } from 'react';
import { useCallback } from 'react';

export const HeaderItem = (): ReactElement => {
  const setLayout = useSetAtom(contentLayoutAtom);
  return (
    <Tooltip content="Chat with AI" placement="bottom-end">
      <IconButton
        onClick={useCallback(
          () =>
            // todo: abstract a context function to open a new tab
            setLayout(layout => {
              if (layout === 'editor') {
                return {
                  direction: 'horizontal',
                  first: 'editor',
                  second: '@affine/copilot-plugin',
                  splitPercentage: 70,
                };
              } else {
                return 'editor';
              }
            }),
          [setLayout]
        )}
      >
        <AiIcon />
      </IconButton>
    </Tooltip>
  );
};
