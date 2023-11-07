import { Menu, MenuItem } from '@toeverything/components/menu';
import type { MouseEvent } from 'react';
import { useMemo } from 'react';

import * as styles from './multi-select.css';

export const MultiSelect = ({
  value,
  onChange,
  options,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  options: {
    label: string;
    value: string;
  }[];
}) => {
  const optionMap = useMemo(
    () => Object.fromEntries(options.map(v => [v.value, v])),
    [options]
  );

  return (
    <Menu
      items={
        <div data-testid="multi-select" className={styles.optionList}>
          {options.map(option => {
            const selected = value.includes(option.value);
            const click = (e: MouseEvent<HTMLDivElement>) => {
              e.stopPropagation();
              e.preventDefault();
              if (selected) {
                onChange(value.filter(v => v !== option.value));
              } else {
                onChange([...value, option.value]);
              }
            };
            return (
              <MenuItem
                data-testid={`multi-select-${option.label}`}
                checked={selected}
                onClick={click}
                key={option.value}
              >
                {option.label}
              </MenuItem>
            );
          })}
        </div>
      }
    >
      <div className={styles.content}>
        {value.length ? (
          <div className={styles.text}>
            {value.map(id => optionMap[id]?.label).join(', ')}
          </div>
        ) : (
          <div style={{ color: 'var(--affine-text-secondary-color)' }}>
            Empty
          </div>
        )}
      </div>
    </Menu>
  );
};
