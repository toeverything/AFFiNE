import {
  notify,
  PropertyValue,
  RadioGroup,
  type RadioItem,
} from '@affine/component';
import { useI18n } from '@affine/i18n';
import type { DocMode } from '@blocksuite/affine/blocks';
import { DocService, useLiveData, useService } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

export const DocPrimaryModeValue = () => {
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
    },
    [doc, t]
  );
  return (
    <PropertyValue>
      <RadioGroup
        width={194}
        value={primaryMode}
        onChange={handleChange}
        items={DocModeItems}
      />
    </PropertyValue>
  );
};
