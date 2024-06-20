import { Menu, MenuItem, Scrollable, Tooltip } from '@affine/component';
import { useI18n } from '@affine/i18n';
import clsx from 'clsx';
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
  const t = useI18n();
  const optionMap = useMemo(
    () => Object.fromEntries(options.map(v => [v.value, v])),
    [options]
  );

  const content = useMemo(
    () => value.map(id => optionMap[id]?.label).join(', '),
    [optionMap, value]
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
        <Tooltip
          content={
            content.length ? content : t['com.affine.filter.empty-tag']()
          }
        >
          {value.length ? (
            <div className={styles.text}>{content}</div>
          ) : (
            <div className={clsx(styles.text, 'empty')}>
              {t['com.affine.filter.empty-tag']()}
            </div>
          )}
        </Tooltip>
      </div>
    </Menu>
  );
};
