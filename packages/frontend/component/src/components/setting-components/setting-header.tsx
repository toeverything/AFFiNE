import type { HTMLAttributes, ReactNode } from 'react';

import { settingHeader } from './share.css';

interface SettingHeaderProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  subtitle?: ReactNode;
}

export const SettingHeader = ({
  title,
  subtitle,
  ...otherProps
}: SettingHeaderProps) => {
  return (
    <div className={settingHeader} {...otherProps}>
      <div className="title">{title}</div>
      {subtitle ? <div className="subtitle">{subtitle}</div> : null}
    </div>
  );
};
