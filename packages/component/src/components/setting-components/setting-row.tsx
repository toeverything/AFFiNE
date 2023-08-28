import clsx from 'clsx';
import type { CSSProperties, PropsWithChildren, ReactNode } from 'react';

import { settingRow } from './share.css';

type SettingRowProps = {
  name: ReactNode;
  desc: ReactNode;
  style?: CSSProperties;
  onClick?: () => void;
  spreadCol?: boolean;
  'data-testid'?: string;
};

export const SettingRow = ({
  name,
  desc,
  children,
  onClick,
  style,
  spreadCol = true,
  ...props
}: PropsWithChildren<SettingRowProps>) => {
  return (
    <div
      className={clsx(settingRow, {
        'two-col': spreadCol,
      })}
      style={style}
      onClick={onClick}
      data-testid={props['data-testid']}
    >
      <div className="left-col">
        <div className="name">{name}</div>
        <div className="desc">{desc}</div>
      </div>
      {spreadCol ? <div className="right-col">{children}</div> : children}
    </div>
  );
};
