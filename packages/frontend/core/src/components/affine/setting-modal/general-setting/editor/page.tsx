import { Switch } from '@affine/component';
import {
  SettingRow,
  SettingWrapper,
} from '@affine/component/setting-components';
import { useAppSettingHelper } from '@affine/core/hooks/affine/use-app-setting-helper';
import { useI18n } from '@affine/i18n';

export const Page = () => {
  const t = useI18n();
  const { appSettings, updateSettings } = useAppSettingHelper();
  return (
    <SettingWrapper title={t['com.affine.settings.editorSettings.page']()}>
      <SettingRow
        name={t['com.affine.settings.editorSettings.page.full-width.title']()}
        desc={t[
          'com.affine.settings.editorSettings.page.full-width.description'
        ]()}
      >
        <Switch
          data-testid="full-width-layout-trigger"
          checked={appSettings.fullWidthLayout}
          onChange={checked => updateSettings('fullWidthLayout', checked)}
        />
      </SettingRow>
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.page.display-doc-info.title'
        ]()}
        desc={t[
          'com.affine.settings.editorSettings.page.display-doc-info.description'
        ]()}
      >
        <Switch />
      </SettingRow>
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.page.display-bi-link.title'
        ]()}
        desc={t[
          'com.affine.settings.editorSettings.page.display-bi-link.description'
        ]()}
      >
        <Switch />
      </SettingRow>
    </SettingWrapper>
  );
};
