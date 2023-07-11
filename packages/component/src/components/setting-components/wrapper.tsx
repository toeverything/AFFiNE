import type { FC, PropsWithChildren, ReactNode } from 'react';

import { wrapper } from './share.css';
export const SettingWrapper: FC<
  PropsWithChildren<{
    title?: ReactNode;
  }>
> = ({ title, children }) => {
  return (
    <div className={wrapper}>
      {title ? <div className="title">{title}</div> : null}
      {children}
    </div>
  );
};
