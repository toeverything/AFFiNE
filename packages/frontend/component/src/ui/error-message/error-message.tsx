import clsx from 'clsx';
import type React from 'react';

import { errorMessage } from './style.css';

export const ErrorMessage = ({
  children,
  inline,
  style,
  className,
}: React.PropsWithChildren<{
  inline?: boolean;
  style?: React.CSSProperties;
  className?: string;
}>) => {
  if (inline) {
    return (
      <span style={style} className={clsx(className, errorMessage)}>
        {children}
      </span>
    );
  }
  return (
    <div style={style} className={clsx(className, errorMessage)}>
      {children}
    </div>
  );
};
