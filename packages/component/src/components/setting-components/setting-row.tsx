import clsx from 'clsx';
import type { CSSProperties, FC, PropsWithChildren, ReactElement } from 'react';

import { settingRow } from './share.css';

export const SettingRow: FC<
  PropsWithChildren<{
    name: string | ReactElement;
    desc: string | ReactElement;
    style?: CSSProperties;
    onClick?: () => void;
    spreadCol?: boolean;
    testId?: string;
  }>
> = ({
  name,
  desc,
  children,
  onClick,
  style,
  spreadCol = true,
  testId = '',
}) => {
  return (
    <div
      className={clsx(settingRow, {
        'two-col': spreadCol,
      })}
      style={style}
      onClick={onClick}
      data-testid={testId}
    >
      <div className="left-col">
        <div className="name">{name}</div>
        <div className="desc">{desc}</div>
      </div>
      {spreadCol ? <div className="right-col">{children}</div> : children}
    </div>
  );
};
