import { rootStore } from '@affine/workspace/atom';
import { Provider } from 'jotai';
import type { ReactElement } from 'react';
import { StrictMode } from 'react';

export const HeaderItemImpl = (): ReactElement => {
  return <button>Chat With AI</button>;
};

export const HeaderItem = (): ReactElement => {
  return (
    <StrictMode>
      <Provider store={rootStore}>
        <HeaderItemImpl />
      </Provider>
    </StrictMode>
  );
};
