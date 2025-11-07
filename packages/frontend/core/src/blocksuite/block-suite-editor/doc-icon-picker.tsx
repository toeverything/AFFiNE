import { IconEditor, IconRenderer } from '@affine/component';
import { ExplorerIconService } from '@affine/core/modules/explorer-icon/services/explorer-icon';
import { useI18n } from '@affine/i18n';
import { SmileSolidIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';

import * as styles from './doc-icon-picker.css';

const TitleContainer = ({
  children,
  hasIcon,
}: {
  children: React.ReactNode;
  hasIcon: boolean;
}) => {
  return (
    <div
      className="doc-icon-container"
      data-has-icon={hasIcon ? 'true' : 'false'}
      style={{
        paddingBottom: 8,
      }}
    >
      {children}
    </div>
  );
};

export const DocIconPicker = ({
  docId,
  readonly,
}: {
  docId: string;
  readonly?: boolean;
}) => {
  const t = useI18n();
  const explorerIconService = useService(ExplorerIconService);

  const icon = useLiveData(explorerIconService.icon$('doc', docId));

  const isPlaceholder = !icon?.icon;

  if (readonly) {
    return isPlaceholder ? null : (
      <div
        className={styles.docIconPickerTrigger}
        data-icon-type={icon?.icon?.type}
      >
        <IconRenderer data={icon.icon} />
      </div>
    );
  }

  return (
    <TitleContainer hasIcon={!isPlaceholder}>
      <IconEditor
        icon={icon?.icon}
        onIconChange={data => {
          explorerIconService.setIcon({
            where: 'doc',
            id: docId,
            icon: data,
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
    </TitleContainer>
  );
};
