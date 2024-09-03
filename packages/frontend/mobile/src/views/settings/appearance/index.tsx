import { useI18n } from '@affine/i18n';

import { SettingGroup } from '../group';
import { FontStyleSetting } from './font';
import { LanguageSetting } from './language';
import { ThemeSetting } from './theme';

export const AppearanceGroup = () => {
  const t = useI18n();
  return (
    <SettingGroup title={t['com.affine.mobile.setting.appearance.title']()}>
      <ThemeSetting />
      <FontStyleSetting />
      <LanguageSetting />
    </SettingGroup>
  );
};
