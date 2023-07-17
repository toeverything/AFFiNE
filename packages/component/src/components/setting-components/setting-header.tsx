import type { FC, HTMLAttributes, ReactNode } from 'react';

import { settingHeader } from './share.css';

export const SettingHeader: FC<
  { title: ReactNode; subtitle?: ReactNode } & Omit<
    HTMLAttributes<HTMLDivElement>,
    'title'
  >
> = ({ title, subtitle, ...otherProps }) => {
  return (
    <div className={settingHeader} {...otherProps}>
      <div className="title">{title}</div>
      <div className="subtitle">{subtitle}</div>
    </div>
  );
};
