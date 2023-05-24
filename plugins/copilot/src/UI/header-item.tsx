import type { ReactElement } from 'react';
import { StrictMode } from 'react';

export const HeaderItemImpl = (): ReactElement => {
  return <button>Chat With AI</button>;
};

export const HeaderItem = (): ReactElement => {
  return (
    <StrictMode>
      <HeaderItemImpl />
    </StrictMode>
  );
};
