import { type MenuProps, MobileMenu, MobileMenuItem } from '@affine/component';
import { ArrowDownSmallIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
import {
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  useCallback,
  useMemo,
  useRef,
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
  native?: boolean;
}

const EMPTY_OPTIONS: DropdownItem<string>[] = [];

export const SettingDropdownSelect = <
  V extends string = string,
  E extends boolean | undefined = true,
>({
  options = EMPTY_OPTIONS as DropdownItem<V>[],
  value,
  emitValue = true,
  onChange,
  className,
  menuOptions,
  native = true,
  ...attrs
}: SettingDropdownSelectProps<V, E>) => {
  const selectedItem = useMemo(
    () => options.find(opt => opt.value === value),
    [options, value]
  );

  if (native) {
    return (
      <NativeSettingDropdownSelect
        options={options}
        value={value}
        emitValue={emitValue as any}
        onChange={onChange}
        {...attrs}
      />
    );
  }

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
      <div
        data-testid="dropdown-select-trigger"
        className={clsx(styles.root, className)}
        {...attrs}
      >
        <span className={styles.label}>{selectedItem?.label ?? ''}</span>

        <ArrowDownSmallIcon className={styles.icon} />
      </div>
    </MobileMenu>
  );
};

export const NativeSettingDropdownSelect = <
  V extends string = string,
  E extends boolean | undefined = true,
>({
  options = EMPTY_OPTIONS as DropdownItem<V>[],
  value,
  emitValue = true,
  onChange,
  className,
  ...attrs
}: Omit<SettingDropdownSelectProps<V, E>, 'native'>) => {
  const nativeSelectRef = useRef<HTMLSelectElement>(null);
  const selectedItem = useMemo(
    () => options.find(opt => opt.value === value),
    [options, value]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      const opt = options.find(opt => opt.value === value);
      if (emitValue) {
        onChange?.(e.target.value as any);
      } else {
        onChange?.(opt as any);
      }
    },
    [emitValue, onChange, options]
  );

  return (
    <div
      data-testid="dropdown-select-trigger"
      className={clsx(styles.root, className)}
      {...attrs}
    >
      <span className={styles.label}>{selectedItem?.label ?? ''}</span>

      <ArrowDownSmallIcon className={styles.icon} />
      <select
        className={styles.nativeSelect}
        ref={nativeSelectRef}
        value={value}
        onChange={handleChange}
        data-testid="native-dropdown-select-trigger"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};
