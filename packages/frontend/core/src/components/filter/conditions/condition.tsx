import { Menu, MenuItem } from '@affine/component';
import type { FilterParams } from '@affine/core/modules/collection-rules';
import clsx from 'clsx';
import type React from 'react';

import { FilterOptionsGroup } from '../options';
import * as styles from './styles.css';

export const Condition = ({
  filter,
  isDraft,
  onDraftCompleted,
  icon,
  name,
  methods,
  onChange,
  value: Value,
}: {
  filter: FilterParams;
  isDraft?: boolean;
  onDraftCompleted?: () => void;
  icon?: React.ReactNode;
  name: React.ReactNode;
  methods?: [string, React.ReactNode][];
  onChange?: (filter: FilterParams) => void;
  value?: React.ElementType<{
    filter: FilterParams;
    isDraft?: boolean;
    onDraftCompleted?: () => void;
    onChange?: (filter: FilterParams) => void;
  }>;
}) => {
  return (
    <>
      <div className={clsx(styles.filterTypeStyle, styles.ellipsisTextStyle)}>
        {icon && <div className={styles.filterTypeIconStyle}>{icon}</div>}
        {name}
      </div>
      <FilterOptionsGroup
        isDraft={isDraft}
        onDraftCompleted={onDraftCompleted}
        initialStep={methods && methods.length > 1 ? 0 : 1}
        items={[
          methods &&
            (({ onDraftCompleted, menuRef }) => {
              return (
                <Menu
                  key={'method'}
                  ref={menuRef}
                  rootOptions={{
                    onClose: onDraftCompleted,
                  }}
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
                    className={clsx(
                      styles.switchStyle,
                      styles.ellipsisTextStyle
                    )}
                    data-testid="filter-method"
                  >
                    {methods.find(
                      ([method]) => method === filter.method
                    )?.[1] ?? 'unknown'}
                  </div>
                </Menu>
              );
            }),
          Value &&
            (({ isDraft, onDraftCompleted }) => (
              <div
                key={'value'}
                className={clsx(
                  styles.filterValueStyle,
                  styles.ellipsisTextStyle
                )}
                data-testid="filter-value"
              >
                <Value
                  filter={filter}
                  isDraft={isDraft}
                  onDraftCompleted={onDraftCompleted}
                  onChange={onChange}
                />
              </div>
            )),
        ]}
      />
    </>
  );
};
