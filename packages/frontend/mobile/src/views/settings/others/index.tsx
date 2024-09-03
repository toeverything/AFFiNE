import { useI18n } from '@affine/i18n';

import { SettingGroup } from '../group';
import { RowLayout } from '../row.layout';

export const OthersGroup = () => {
  const t = useI18n();

  return (
    <SettingGroup title={t['com.affine.mobile.setting.others.title']()}>
      <RowLayout
        label={t['com.affine.mobile.setting.others.github']()}
        href="https://github.com/toeverything/AFFiNE"
      />

      <RowLayout
        label={t['com.affine.mobile.setting.others.website']()}
        href="https://affine.pro/"
      />

      <RowLayout
        label={t['com.affine.mobile.setting.others.privacy']()}
        href="https://affine.pro/privacy"
      />

      <RowLayout
        label={t['com.affine.mobile.setting.others.terms']()}
        href="https://affine.pro/terms"
      />
    </SettingGroup>
  );
};
