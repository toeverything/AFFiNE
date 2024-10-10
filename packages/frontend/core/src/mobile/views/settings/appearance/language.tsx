import { I18nService } from '@affine/core/modules/i18n';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useMemo } from 'react';

import { SettingDropdownSelect } from '../dropdown-select';
import { RowLayout } from '../row.layout';

export const LanguageSetting = () => {
  const t = useI18n();
  const i18n = useService(I18nService).i18n;
  const currentLanguage = useLiveData(i18n.currentLanguage$);

  const languageOptions = useMemo(
    () =>
      i18n.languageList.map(language => ({
        label: language.originalName,
        value: language.key,
      })),
    [i18n]
  );

  return (
    <RowLayout label={t['com.affine.mobile.setting.appearance.language']()}>
      <SettingDropdownSelect
        options={languageOptions}
        value={currentLanguage.key}
        onChange={i18n.changeLanguage}
        menuOptions={{
          contentOptions: {
            style: {
              maxHeight: '60dvh',
              overflowY: 'auto',
            },
          },
        }}
      />
    </RowLayout>
  );
};
