import { Button, MobileMenu, MobileMenuItem } from '@affine/component';
import {
  getGroupOptions,
  useAllDocDisplayProperties,
} from '@affine/core/components/page-list';
import { useI18n } from '@affine/i18n';
import { ArrowRightSmallIcon } from '@blocksuite/icons/rc';
import { useMemo } from 'react';

import * as styles from './menu.css';

export const AllDocsMenu = () => {
  const t = useI18n();

  const [properties, setProperties] = useAllDocDisplayProperties();
  const groupOptions = useMemo(() => getGroupOptions(t), [t]);

  const activeGroup = useMemo(
    () => groupOptions.find(g => g.value === properties.groupBy),
    [groupOptions, properties.groupBy]
  );

  return (
    <div className={styles.root}>
      <header className={styles.head}>Display Settings</header>
      <MobileMenu
        items={
          <>
            <div className={styles.divider} />
            {groupOptions.map(group => (
              <MobileMenuItem
                onSelect={() => setProperties('groupBy', group.value)}
                selected={properties.groupBy === group.value}
                key={group.value}
              >
                {group.label}
              </MobileMenuItem>
            ))}
          </>
        }
      >
        <div className={styles.item}>
          <span>{t['com.affine.page.display.grouping']()}</span>
          <div className={styles.itemSuffix}>
            <span className={styles.itemSuffixText}>{activeGroup?.label}</span>
            <ArrowRightSmallIcon className={styles.itemSuffixIcon} />
          </div>
        </div>
      </MobileMenu>

      <div className={styles.divider} />

      <div className={styles.item}>
        {t['com.affine.page.display.display-properties']()}
      </div>
      <div className={styles.propertiesList}>
        <Button
          size="large"
          className={styles.propertyButton}
          data-selected={properties.displayProperties.tags}
          onClick={() =>
            setProperties('displayProperties', {
              ...properties.displayProperties,
              tags: !properties.displayProperties.tags,
            })
          }
        >
          Tag
        </Button>
      </div>
    </div>
  );
};
