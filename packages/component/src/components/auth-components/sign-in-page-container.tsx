import type { PropsWithChildren } from 'react';

import { signInPageContainer } from './share.css';
export const SignInPageContainer = ({ children }: PropsWithChildren) => {
  return <div className={signInPageContainer}>{children}</div>;
};
