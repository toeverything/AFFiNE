import { useLanguageHelper } from '@affine/core/hooks/affine/use-language-helper';
import { useI18n } from '@affine/i18n';
import { useMemo } from 'react';

import { SettingDropdownSelect } from '../dropdown-select';
import { RowLayout } from '../row.layout';

export const LanguageSetting = () => {
  const t = useI18n();
  const { currentLanguage, languagesList, onLanguageChange } =
    useLanguageHelper();

  const languageOptions = useMemo(
    () =>
      languagesList.map(language => ({
        label: language.originalName,
        value: language.tag,
      })),
    [languagesList]
  );

  return (
    <RowLayout label={t['com.affine.mobile.setting.appearance.language']()}>
      <SettingDropdownSelect
        options={languageOptions}
        value={currentLanguage?.tag}
        onChange={onLanguageChange}
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
