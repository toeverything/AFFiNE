import { Switch } from '@affine/component';
import { DoneIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

import { IntegrationCardIcon } from './card';
import * as styles from './setting.css';

export const IntegrationSettingHeader = ({
  icon,
  name,
  desc,
  action,
  divider = true,
}: {
  icon: ReactNode;
  name: string;
  desc: string;
  action?: ReactNode;
  divider?: boolean;
}) => {
  return (
    <header className={styles.header} data-divider={divider}>
      <IntegrationCardIcon className={styles.headerIcon}>
        {icon}
      </IntegrationCardIcon>
      <div className={styles.headerContent}>
        <h1 className={styles.headerTitle}>{name}</h1>
        <p className={styles.headerCaption}>{desc}</p>
      </div>
      {action}
    </header>
  );
};

// universal
export interface IntegrationSettingItemProps extends HTMLAttributes<HTMLDivElement> {
  name?: ReactNode;
  desc?: ReactNode;
}
export const IntegrationSettingItem = ({
  name,
  desc,
  children,
  className,
  ...props
}: IntegrationSettingItemProps) => {
  return (
    <div
      data-has-desc={!!desc}
      className={clsx(styles.settingItem, className)}
      {...props}
    >
      <div>
        {name && <h6 className={styles.settingName}>{name}</h6>}
        {desc && <p className={styles.settingDesc}>{desc}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
};

// toggle
export interface IntegrationSettingToggleProps {
  name: string;
  desc?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}
export const IntegrationSettingToggle = ({
  name,
  desc,
  checked,
  onChange,
}: IntegrationSettingToggleProps) => {
  return (
    <IntegrationSettingItem name={name} desc={desc}>
      <Switch checked={checked} onChange={onChange} />
    </IntegrationSettingItem>
  );
};

// text-radio-group
export interface IntegrationSettingTextRadioGroupItem {
  name: string;
  desc?: string;
  value: any;
}
export interface IntegrationSettingTextRadioGroupProps {
  items: IntegrationSettingTextRadioGroupItem[];
  checked: any;
  onChange: (value: any) => void;
}
export const IntegrationSettingTextRadioGroup = ({
  items,
  checked,
  onChange,
}: IntegrationSettingTextRadioGroupProps) => {
  return (
    <div className={styles.textRadioGroup}>
      {items.map(item => (
        <div
          onClick={() => onChange(item.value)}
          key={item.value}
          className={styles.textRadioGroupItem}
        >
          <div>
            <div className={styles.textRadioGroupItemName}>{item.name}</div>
            {item.desc && (
              <div className={styles.textRadioGroupItemDesc}>{item.desc}</div>
            )}
          </div>
          <div className={styles.textRadioGroupItemCheckWrapper}>
            {checked === item.value ? <DoneIcon /> : null}
          </div>
        </div>
      ))}
    </div>
  );
};
