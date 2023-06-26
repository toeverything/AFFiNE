import type { CSSProperties, FC, PropsWithChildren, ReactElement } from 'react';

import { settingRow } from './share.css';

export const SettingRow: FC<
  PropsWithChildren<{
    name: string;
    desc: string | ReactElement;
    style?: CSSProperties;
    onClick?: () => void;
  }>
> = ({ name, desc, children, onClick, style }) => {
  return (
    <div className={settingRow} style={style} onClick={onClick}>
      <div className="left-col">
        <div className="name">{name}</div>
        <div className="desc">{desc}</div>
      </div>
      <div className="right-col">{children}</div>
    </div>
  );
};
