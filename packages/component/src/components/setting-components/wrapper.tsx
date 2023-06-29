import type { FC, PropsWithChildren } from 'react';

import { wrapper } from './share.css';
export const SettingWrapper: FC<
  PropsWithChildren<{
    title?: string;
  }>
> = ({ title, children }) => {
  return (
    <div className={wrapper}>
      {title ? <div className="title">{title}</div> : null}
      {children}
    </div>
  );
};
