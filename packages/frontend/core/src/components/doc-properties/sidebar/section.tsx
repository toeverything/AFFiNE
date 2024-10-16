import { IconButton } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { ToggleCollapseIcon } from '@blocksuite/icons/rc';
import { Trigger as CollapsibleTrigger } from '@radix-ui/react-collapsible';

import * as styles from './section.css';

export const DocPropertyListSidebarSection = () => {
  const t = useI18n();
  return (
    <div className={styles.headerRoot}>
      <span className={styles.headerTitle}>
        {t['com.affine.propertySidebar.property-list.section']()}
      </span>
      <CollapsibleTrigger asChild>
        <IconButton>
          <ToggleCollapseIcon className={styles.collapseIcon} />
        </IconButton>
      </CollapsibleTrigger>
    </div>
  );
};

export const AddDocPropertySidebarSection = () => {
  const t = useI18n();
  return (
    <div className={styles.headerRoot}>
      <span className={styles.headerTitle}>
        {t['com.affine.propertySidebar.add-more.section']()}
      </span>
      <CollapsibleTrigger asChild>
        <IconButton>
          <ToggleCollapseIcon className={styles.collapseIcon} />
        </IconButton>
      </CollapsibleTrigger>
    </div>
  );
};
