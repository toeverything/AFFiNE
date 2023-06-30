import type { FC, HTMLAttributes } from 'react';

import { settingHeader } from './share.css';

export const SettingHeader: FC<
  { title: string; subtitle?: string } & Omit<
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
