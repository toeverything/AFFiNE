import clsx from 'clsx';
import type { PropsWithChildren, ReactNode } from 'react';

import { wrapper, wrapperDisabled } from './share.css';

interface SettingWrapperProps {
  id?: string;
  title?: ReactNode;
  disabled?: boolean;
}

export const SettingWrapper = ({
  id,
  title,
  children,
  disabled,
}: PropsWithChildren<SettingWrapperProps>) => {
  return (
    <div id={id} className={clsx(wrapper, disabled && wrapperDisabled)}>
      {title ? <div className="title">{title}</div> : null}
      {children}
    </div>
  );
};
