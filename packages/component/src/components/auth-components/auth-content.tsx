import clsx from 'clsx';
import type { FC, HTMLAttributes, PropsWithChildren } from 'react';

import { authContent } from './share.css';

export const AuthContent: FC<
  PropsWithChildren & HTMLAttributes<HTMLDivElement>
> = ({ children, className, ...otherProps }) => {
  return (
    <div className={clsx(authContent, className)} {...otherProps}>
      {children}
    </div>
  );
};
