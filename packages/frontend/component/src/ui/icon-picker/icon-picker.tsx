import { cssVarV2 } from '@toeverything/theme/v2';
import clsx from 'clsx';
import { type HTMLAttributes, useState } from 'react';

import { Button } from '../button';
import { RadioGroup, type RadioItem } from '../radio';
import * as styles from './icon-picker.css';
import { AffineIconPicker } from './picker/affine-icon/affine-icon-picker';
import { EmojiPicker } from './picker/emoji/emoji-picker';
import { type IconData, IconType } from './type';

const panels: Array<RadioItem> = [
  { value: 'Emoji', className: styles.headerNavItem },
  { value: 'Icons', className: styles.headerNavItem },
];

export const IconPicker = ({
  className,
  style,
  onSelect,
}: Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> & {
  onSelect?: (data?: IconData) => void;
}) => {
  const [activePanel, setActivePanel] = useState<string>('Emoji');

  return (
    <div className={clsx(styles.container, className)} style={{ ...style }}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          {/* Nav */}
          <RadioGroup
            items={panels}
            value={activePanel}
            onChange={setActivePanel}
            gap={12}
            padding={0}
            borderRadius={4}
            className={styles.headerNav}
            indicatorStyle={{
              backgroundColor: cssVarV2.button.primary,
              height: 2,
              bottom: -6,
              top: 'unset',
            }}
          />

          {/* Remove */}
          <Button
            variant="plain"
            style={{ color: cssVarV2.text.secondary, fontWeight: 500 }}
            onClick={() => onSelect?.()}
          >
            Remove
          </Button>
        </div>
      </header>
      <main className={styles.main}>
        {activePanel === 'Emoji' ? (
          <EmojiPicker
            onSelect={emoji => {
              onSelect?.({ type: IconType.Emoji, unicode: emoji });
            }}
          />
        ) : activePanel === 'Icons' ? (
          <AffineIconPicker
            onSelect={(icon, color) => {
              onSelect?.({ type: IconType.AffineIcon, name: icon, color });
            }}
          />
        ) : null}
      </main>
    </div>
  );
};
