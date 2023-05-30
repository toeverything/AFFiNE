import { IconButton, Tooltip } from '@affine/component';
import type { PluginUIAdapter } from '@toeverything/plugin-infra/type';
import { useSetAtom } from 'jotai';
import type { ReactElement } from 'react';
import { useCallback } from 'react';

export const HeaderItem: PluginUIAdapter['headerItem'] = ({
  contentLayoutAtom,
}): ReactElement => {
  const setLayout = useSetAtom(contentLayoutAtom);
  return (
    <Tooltip content="Chat with AI" placement="bottom-end">
      <IconButton
        onClick={useCallback(
          () =>
            setLayout(layout => {
              if (layout === 'editor') {
                return {
                  direction: 'row',
                  first: 'editor',
                  second: 'com.affine.copilot',
                  splitPercentage: 80,
                };
              } else {
                return 'editor';
              }
            }),
          [setLayout]
        )}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="icon icon-tabler icon-tabler-brand-hipchat"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="currentColor"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
          <path d="M17.802 17.292s.077 -.055 .2 -.149c1.843 -1.425 3 -3.49 3 -5.789c0 -4.286 -4.03 -7.764 -9 -7.764c-4.97 0 -9 3.478 -9 7.764c0 4.288 4.03 7.646 9 7.646c.424 0 1.12 -.028 2.088 -.084c1.262 .82 3.104 1.493 4.716 1.493c.499 0 .734 -.41 .414 -.828c-.486 -.596 -1.156 -1.551 -1.416 -2.29z"></path>
          <path d="M7.5 13.5c2.5 2.5 6.5 2.5 9 0"></path>
        </svg>
      </IconButton>
    </Tooltip>
  );
};
