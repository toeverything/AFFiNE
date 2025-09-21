import { IconEditor } from '@affine/component';
import { ExplorerIconService } from '@affine/core/modules/explorer-icon/services/explorer-icon';
import { useI18n } from '@affine/i18n';
import { SmileSolidIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';

import * as styles from './doc-icon-picker.css';

export const DocIconPicker = ({ docId }: { docId: string }) => {
  const t = useI18n();
  const explorerIconService = useService(ExplorerIconService);

  const icon = useLiveData(explorerIconService.icon$('doc', docId));

  const isPlaceholder = !icon?.type && !icon?.icon;

  return (
    <div
      className="doc-title-container"
      style={{
        paddingTop: 0,
        paddingBottom: 0,
        // title container has `padding-top`
        transform: isPlaceholder ? 'translateY(80%)' : 'translateY(50%)',
      }}
    >
      <IconEditor
        iconType={icon?.type}
        icon={icon?.icon}
        onIconChange={(type, icon) => {
          explorerIconService.setIcon({
            where: 'doc',
            id: docId,
            type,
            icon,
          });
        }}
        closeAfterSelect={true}
        triggerVariant="plain"
        triggerClassName={
          isPlaceholder ? styles.placeholder : styles.docIconPickerTrigger
        }
        iconPlaceholder={
          <div className={styles.placeholderContent}>
            <SmileSolidIcon className={styles.placeholderContentIcon} />
            <span className={styles.placeholderContentText}>
              {t['com.affine.docIconPicker.placeholder']()}
            </span>
          </div>
        }
      />
    </div>
  );
};
