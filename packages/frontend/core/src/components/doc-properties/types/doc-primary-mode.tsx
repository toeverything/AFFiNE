import { notify, PropertyValue, type RadioItem } from '@affine/component';
import { DocService } from '@affine/core/modules/doc';
import { useI18n } from '@affine/i18n';
import type { DocMode } from '@blocksuite/affine/model';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import { DocPropertyRadioGroup } from '../widgets/radio-group';
import * as styles from './doc-primary-mode.css';
import type { PropertyValueProps } from './types';

export const DocPrimaryModeValue = ({
  onChange,
  readonly,
}: PropertyValueProps) => {
  const t = useI18n();
  const doc = useService(DocService).doc;

  const primaryMode = useLiveData(doc.primaryMode$);

  const DocModeItems = useMemo<RadioItem[]>(
    () => [
      {
        value: 'page' as DocMode,
        label: t['Page'](),
      },
      {
        value: 'edgeless' as DocMode,
        label: t['Edgeless'](),
      },
    ],
    [t]
  );

  const handleChange = useCallback(
    (mode: DocMode) => {
      doc.setPrimaryMode(mode);
      notify.success({
        title:
          mode === 'page'
            ? t['com.affine.toastMessage.defaultMode.page.title']()
            : t['com.affine.toastMessage.defaultMode.edgeless.title'](),
        message:
          mode === 'page'
            ? t['com.affine.toastMessage.defaultMode.page.message']()
            : t['com.affine.toastMessage.defaultMode.edgeless.message'](),
      });
      onChange?.(mode, true);
    },
    [doc, t, onChange]
  );
  return (
    <PropertyValue
      className={styles.container}
      hoverable={false}
      readonly={readonly}
    >
      <DocPropertyRadioGroup
        value={primaryMode}
        onChange={handleChange}
        items={DocModeItems}
        disabled={readonly}
      />
    </PropertyValue>
  );
};
