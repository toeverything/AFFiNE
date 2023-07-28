import type { FC, PropsWithChildren } from 'react';

import { authContent } from './share.css';

export const AuthContent: FC<PropsWithChildren> = ({ children }) => {
  return <div className={authContent}>{children}</div>;
};
