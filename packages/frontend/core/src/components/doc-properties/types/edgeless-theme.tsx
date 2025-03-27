import { PropertyValue, type RadioItem } from '@affine/component';
import { DocService } from '@affine/core/modules/doc';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import { DocPropertyRadioGroup } from '../widgets/radio-group';
import * as styles from './edgeless-theme.css';
import type { PropertyValueProps } from './types';

const getThemeOptions = (t: ReturnType<typeof useI18n>) =>
  [
    {
      value: 'system',
      label: t['com.affine.themeSettings.auto'](),
    },
    {
      value: 'light',
      label: t['com.affine.themeSettings.light'](),
    },
    {
      value: 'dark',
      label: t['com.affine.themeSettings.dark'](),
    },
  ] satisfies RadioItem[];

export const EdgelessThemeValue = ({
  onChange,
  readonly,
}: PropertyValueProps) => {
  const t = useI18n();
  const doc = useService(DocService).doc;
  const edgelessTheme = useLiveData(doc.properties$).edgelessColorTheme;

  const handleChange = useCallback(
    (theme: string) => {
      doc.record.setProperty('edgelessColorTheme', theme);
      onChange?.(theme, true);
    },
    [doc, onChange]
  );
  const themeItems = useMemo<RadioItem[]>(() => getThemeOptions(t), [t]);

  return (
    <PropertyValue
      className={styles.container}
      hoverable={false}
      readonly={readonly}
    >
      <DocPropertyRadioGroup
        value={edgelessTheme || 'system'}
        onChange={handleChange}
        items={themeItems}
        disabled={readonly}
      />
    </PropertyValue>
  );
};
