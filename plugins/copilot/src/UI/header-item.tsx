import type { ReactElement } from 'react';
import { StrictMode } from 'react';

export const HeaderItemImpl = (): ReactElement => {
  return <div>AI</div>;
};

export const HeaderItem = (): ReactElement => {
  return (
    <StrictMode>
      <HeaderItemImpl />
    </StrictMode>
  );
};
