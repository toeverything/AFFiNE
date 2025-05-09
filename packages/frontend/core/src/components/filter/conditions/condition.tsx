import { Menu, MenuItem } from '@affine/component';
import type { FilterParams } from '@affine/core/modules/collection-rules';
import clsx from 'clsx';
import type React from 'react';

import * as styles from './styles.css';

export const Condition = ({
  filter,
  icon,
  name,
  methods,
  onChange,
  value,
}: {
  filter: FilterParams;
  icon?: React.ReactNode;
  name: React.ReactNode;
  methods?: [string, React.ReactNode][];
  onChange?: (filter: FilterParams) => void;
  value?: React.ReactNode;
}) => {
  return (
    <>
      <div className={clsx(styles.filterTypeStyle, styles.ellipsisTextStyle)}>
        {icon && <div className={styles.filterTypeIconStyle}>{icon}</div>}
        {name}
      </div>
      {methods && (
        <Menu
          items={methods.map(([method, name]) => (
            <MenuItem
              onClick={() => {
                onChange?.({
                  ...filter,
                  method,
                });
              }}
              selected={filter.method === method}
              key={method}
            >
              {name}
            </MenuItem>
          ))}
        >
          <div
            className={clsx(styles.switchStyle, styles.ellipsisTextStyle)}
            data-testid="filter-method"
          >
            {methods.find(([method]) => method === filter.method)?.[1] ??
              'unknown'}
          </div>
        </Menu>
      )}
      {value && (
        <div
          className={clsx(styles.filterValueStyle, styles.ellipsisTextStyle)}
          data-testid="filter-method"
        >
          {value}
        </div>
      )}
    </>
  );
};
