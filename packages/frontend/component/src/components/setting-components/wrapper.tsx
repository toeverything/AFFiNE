import type { PropsWithChildren, ReactNode } from 'react';

import { wrapper } from './share.css';

interface SettingWrapperProps {
  title?: ReactNode;
}

export const SettingWrapper = ({
  title,
  children,
}: PropsWithChildren<SettingWrapperProps>) => {
  return (
    <div className={wrapper}>
      {title ? <div className="title">{title}</div> : null}
      {children}
    </div>
  );
};
