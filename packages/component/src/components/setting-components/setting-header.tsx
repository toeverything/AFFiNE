import type { FC } from 'react';

import { settingHeader } from './share.css';
export const SettingHeader: FC<{ title: string; subtitle?: string }> = ({
  title,
  subtitle,
}) => {
  return (
    <div className={settingHeader}>
      <div className="title">{title}</div>
      <div className="subtitle">{subtitle}</div>
    </div>
  );
};
