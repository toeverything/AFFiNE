import clsx from 'clsx';
import type { PropsWithChildren, ReactNode } from 'react';

import { wrapper, wrapperDisabled } from './share.css';

interface SettingWrapperProps {
  id?: string;
  title?: ReactNode;
  disabled?: boolean;
  testId?: string;
}

export const SettingWrapper = ({
  id,
  title,
  children,
  disabled,
  testId,
}: PropsWithChildren<SettingWrapperProps>) => {
  return (
    <div
      id={id}
      className={clsx(wrapper, disabled && wrapperDisabled)}
      data-testid={testId}
      aria-disabled={disabled}
    >
      {title ? <div className="title">{title}</div> : null}
      {children}
    </div>
  );
};
