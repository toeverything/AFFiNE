import { Menu, Scrollable } from '@affine/component';
import { useI18n } from '@affine/i18n';
import type { DocCustomPropertyInfo } from '@toeverything/infra';
import { chunk } from 'lodash-es';

import { type DocPropertyIconName, DocPropertyIconNames } from './constant';
import { DocPropertyIcon, iconNameToComponent } from './doc-property-icon';
import * as styles from './icons-selector.css';

const iconsPerRow = 6;

const iconRows = chunk(DocPropertyIconNames, iconsPerRow);

const IconsSelectorPanel = ({
  selectedIcon,
  onSelectedChange,
}: {
  selectedIcon?: string | null;
  onSelectedChange: (icon: DocPropertyIconName) => void;
}) => {
  const t = useI18n();
  return (
    <Scrollable.Root>
      <div role="heading" className={styles.menuHeader}>
        {t['com.affine.page-properties.icons']()}
      </div>
      <Scrollable.Viewport className={styles.iconsContainerScrollable}>
        <div className={styles.iconsContainer}>
          {iconRows.map((iconRow, index) => {
            return (
              <div key={index} className={styles.iconsRow}>
                {iconRow.map(iconName => {
                  const Icon = iconNameToComponent(iconName);
                  return (
                    <div
                      onClick={() => onSelectedChange(iconName)}
                      key={iconName}
                      className={styles.iconButton}
                      data-name={iconName}
                      data-active={iconName === selectedIcon}
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

export const DocPropertyIconSelector = ({
  propertyInfo,
  onSelectedChange,
}: {
  propertyInfo: DocCustomPropertyInfo;
  onSelectedChange: (icon: DocPropertyIconName) => void;
}) => {
  return (
    <Menu
      items={
        <IconsSelectorPanel
          selectedIcon={propertyInfo.icon}
          onSelectedChange={onSelectedChange}
        />
      }
    >
      <div className={styles.iconSelectorButton}>
        <DocPropertyIcon propertyInfo={propertyInfo} />
      </div>
    </Menu>
  );
};
