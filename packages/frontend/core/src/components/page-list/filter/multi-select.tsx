import { Menu, MenuItem, Scrollable } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
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
  const t = useAFFiNEI18N();
  const optionMap = useMemo(
    () => Object.fromEntries(options.map(v => [v.value, v])),
    [options]
  );

  const items = useMemo(() => {
    return (
      <Scrollable.Root>
        <Scrollable.Viewport
          data-testid="multi-select"
          className={styles.optionList}
        >
          {options.length === 0 ? (
            <MenuItem checked={true}>
              {t['com.affine.filter.empty-tag']()}
            </MenuItem>
          ) : (
            options.map(option => {
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
            })
          )}
        </Scrollable.Viewport>
        <Scrollable.Scrollbar className={styles.scrollbar} />
      </Scrollable.Root>
    );
  }, [onChange, options, t, value]);

  return (
    <Menu items={items}>
      <div className={styles.content}>
        {value.length ? (
          <div className={styles.text}>
            {value.map(id => optionMap[id]?.label).join(', ')}
          </div>
        ) : (
          <div style={{ color: 'var(--affine-text-secondary-color)' }}>
            {t['com.affine.filter.empty-tag']()}
          </div>
        )}
      </div>
    </Menu>
  );
};
