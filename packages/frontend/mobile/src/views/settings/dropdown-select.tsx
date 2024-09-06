import { type MenuProps, MobileMenu, MobileMenuItem } from '@affine/component';
import { ArrowDownSmallIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
import {
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  useMemo,
} from 'react';

import * as styles from './dropdown-select.css';

interface DropdownItem<V extends string> {
  label?: ReactNode;
  value: V;
  testId?: string;
  style?: CSSProperties;
  [key: string]: any;
}
export interface SettingDropdownSelectProps<
  V extends string,
  E extends boolean | undefined,
> extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  options?: Array<DropdownItem<V>>;
  value?: V;
  onChange?: (
    v: E extends true ? DropdownItem<V>['value'] : DropdownItem<V>
  ) => void;
  emitValue?: E;
  menuOptions?: Omit<MenuProps, 'items' | 'children'>;
}

export const SettingDropdownSelect = <
  V extends string = string,
  E extends boolean | undefined = true,
>({
  options = [],
  value,
  emitValue = true,
  onChange,
  className,
  menuOptions,
  ...attrs
}: SettingDropdownSelectProps<V, E>) => {
  const selectedItem = useMemo(
    () => options.find(opt => opt.value === value),
    [options, value]
  );
  return (
    <MobileMenu
      items={options.map(opt => (
        <MobileMenuItem
          divide
          key={opt.value}
          selected={value === opt.value}
          data-testid={opt.testId}
          onSelect={() =>
            emitValue ? onChange?.(opt.value as any) : onChange?.(opt as any)
          }
          style={opt.style}
        >
          {opt.label}
        </MobileMenuItem>
      ))}
      {...menuOptions}
    >
      <div className={clsx(styles.root, className)} {...attrs}>
        <span className={styles.label}>{selectedItem?.label ?? ''}</span>

        <ArrowDownSmallIcon className={styles.icon} />
      </div>
    </MobileMenu>
  );
};
