import { getThemeOptions } from '@affine/core/components/affine/setting-modal/general-setting/appearance';
import { useI18n } from '@affine/i18n';
import { useTheme } from 'next-themes';
import { useMemo } from 'react';

import { SettingDropdownSelect } from '../dropdown-select';
import { RowLayout } from '../row.layout';

export const ThemeSetting = () => {
  const t = useI18n();

  const options = useMemo(() => getThemeOptions(t), [t]);
  const { setTheme, theme } = useTheme();

  return (
    <RowLayout label={t['com.affine.mobile.setting.appearance.theme']()}>
      <SettingDropdownSelect
        options={options}
        value={theme}
        onChange={setTheme}
      />
    </RowLayout>
  );
};
