import { DoneIcon } from '@blocksuite/icons';
import type { MouseEvent } from 'react';
import { useMemo } from 'react';

import Menu from '../../../ui/menu/menu';
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
      trigger="click"
      content={
        <div data-testid="multi-select" className={styles.optionList}>
          {options.map(option => {
            const selected = value.includes(option.value);
            const click = (e: MouseEvent<HTMLDivElement>) => {
              e.stopPropagation();
              if (selected) {
                onChange(value.filter(v => v !== option.value));
              } else {
                onChange([...value, option.value]);
              }
            };
            return (
              <div
                className={styles.selectOption}
                data-testid="select-option"
                style={{
                  backgroundColor: selected
                    ? 'var(--affine-hover-color)'
                    : undefined,
                }}
                onClick={click}
                key={option.value}
              >
                <div className={styles.optionLabel}>{option.label}</div>
                <div
                  style={{ opacity: selected ? 1 : 0 }}
                  className={styles.done}
                >
                  <DoneIcon />
                </div>
              </div>
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
