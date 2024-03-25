import { Menu, Scrollable } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { chunk } from 'lodash-es';
import { useEffect, useRef } from 'react';

import type { PagePropertyIcon } from './icons-mapping';
import { iconNames, nameToIcon } from './icons-mapping';
import * as styles from './icons-selector.css';

const iconsPerRow = 6;

const iconRows = chunk(iconNames, iconsPerRow);

export const IconsSelectorPanel = ({
  selected,
  onSelectedChange,
}: {
  selected: PagePropertyIcon;
  onSelectedChange: (icon: PagePropertyIcon) => void;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) {
      return;
    }
    const iconButton = ref.current.querySelector(
      `[data-name="${selected}"]`
    ) as HTMLDivElement;
    if (!iconButton) {
      return;
    }
    iconButton.scrollIntoView({ block: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const t = useAFFiNEI18N();
  return (
    <Scrollable.Root>
      <div role="heading" className={styles.menuHeader}>
        {t['com.affine.page-properties.icons']()}
      </div>
      <Scrollable.Viewport className={styles.iconsContainerScrollable}>
        <div className={styles.iconsContainer} ref={ref}>
          {iconRows.map((iconRow, index) => {
            return (
              <div key={index} className={styles.iconsRow}>
                {iconRow.map(iconName => {
                  const Icon = nameToIcon(iconName);
                  return (
                    <div
                      onClick={() => onSelectedChange(iconName)}
                      key={iconName}
                      className={styles.iconButton}
                      data-name={iconName}
                      data-active={selected === iconName}
                    >
                      <Icon key={iconName} />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        <Scrollable.Scrollbar className={styles.iconsContainerScroller} />
      </Scrollable.Viewport>
    </Scrollable.Root>
  );
};

export const IconsSelectorButton = ({
  selected,
  onSelectedChange,
}: {
  selected: PagePropertyIcon;
  onSelectedChange: (icon: PagePropertyIcon) => void;
}) => {
  const Icon = nameToIcon(selected);
  return (
    <Menu
      items={
        <IconsSelectorPanel
          selected={selected}
          onSelectedChange={onSelectedChange}
        />
      }
    >
      <div className={styles.iconSelectorButton}>
        <Icon />
      </div>
    </Menu>
  );
};
