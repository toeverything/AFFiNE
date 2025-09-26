import { cssVarV2 } from '@toeverything/theme/v2';
import clsx from 'clsx';
import { type HTMLAttributes, useState } from 'react';

import { Button } from '../button';
import { RadioGroup, type RadioItem } from '../radio';
import * as styles from './icon-picker.css';
import { AffineIconPicker } from './picker/affine-icon/affine-icon-picker';
import { EmojiPicker } from './picker/emoji/emoji-picker';

const panels: Array<RadioItem> = [
  { value: 'Emoji', className: styles.headerNavItem },
  { value: 'Icons', className: styles.headerNavItem },
];

export const IconPicker = ({
  className,
  style,
}: HTMLAttributes<HTMLDivElement> & {
  onSelect?: (
    type: 'emoji' | 'affine-icon',
    data: { icon?: string; color?: string }
  ) => void;
}) => {
  const [activePanel, setActivePanel] = useState<string>('Icons');

  // const ActivePanel = panels.find(
  //   panel => panel.value === activePanel
  // )?.component;

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
            onClick={() => void 0}
          >
            Remove
          </Button>
        </div>
      </header>
      <main className={styles.main}>
        {activePanel === 'Emoji' ? (
          <EmojiPicker />
        ) : activePanel === 'Icons' ? (
          <AffineIconPicker />
        ) : null}
      </main>
    </div>
  );
};
