import type { HTMLAttributes, ReactNode } from 'react';

import { settingHeader, settingHeaderBeta } from './share.css';

interface SettingHeaderProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'title'
> {
  title: ReactNode;
  subtitle?: ReactNode;
  beta?: boolean;
}

export const SettingHeader = ({
  title,
  subtitle,
  beta,
  ...otherProps
}: SettingHeaderProps) => {
  return (
    <div className={settingHeader} {...otherProps}>
      <div className="title">
        {title}
        {beta ? <div className={settingHeaderBeta}>Beta</div> : null}
      </div>
      {subtitle ? <div className="subtitle">{subtitle}</div> : null}
    </div>
  );
};
