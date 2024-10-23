import { IconButton, Input, Menu, MenuItem } from '@affine/component';
import { MoreHorizontalIcon } from '@blocksuite/icons/rc';
import { cssVar } from '@toeverything/theme';
import { useCallback, useState } from 'react';

import * as styles from '../theme-editor.css';
import { SimpleColorPicker } from './simple-color-picker';

export const ColorCell = ({
  value,
  custom,
  onValueChange,
}: {
  value: string;
  custom?: string;
  onValueChange?: (color?: string) => void;
}) => {
  const [inputValue, setInputValue] = useState(value);

  const onInput = useCallback(
    (color: string) => {
      onValueChange?.(color);
      setInputValue(color);
    },
    [onValueChange]
  );
  return (
    <div className={styles.colorCell}>
      <div>
        <div data-override={!!custom} className={styles.colorCellRow}>
          <div
            className={styles.colorCellColor}
            style={{ backgroundColor: value }}
          />
          <div className={styles.colorCellValue}>{value}</div>
        </div>

        <div data-empty={!custom} data-custom className={styles.colorCellRow}>
          <div
            className={styles.colorCellColor}
            style={{ backgroundColor: custom }}
          />
          <div className={styles.colorCellValue}>{custom}</div>
        </div>
      </div>

      <Menu
        contentOptions={{ style: { background: cssVar('white') } }}
        items={
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SimpleColorPicker
              value={inputValue}
              setValue={onInput}
              className={styles.colorCellInput}
            />
            <Input
              value={inputValue}
              onChange={onInput}
              placeholder="Input color"
            />
            {custom ? (
              <MenuItem type="danger" onClick={() => onValueChange?.()}>
                Recover
              </MenuItem>
            ) : null}
          </ul>
        }
      >
        <IconButton size="14" icon={<MoreHorizontalIcon />} />
      </Menu>
    </div>
  );
};
