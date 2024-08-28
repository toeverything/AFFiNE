import { Switch } from '@affine/component';
import {
  SettingRow,
  SettingWrapper,
} from '@affine/component/setting-components';
import { EditorSettingService } from '@affine/core/modules/editor-settting';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback } from 'react';

export const Page = () => {
  const t = useI18n();
  const editorSetting = useService(EditorSettingService).editorSetting;
  const settings = useLiveData(editorSetting.settings$);

  const handleFullWidthLayoutChange = useCallback(
    (checked: boolean) => {
      editorSetting.set('fullWidthLayout', checked);
    },
    [editorSetting]
  );
  const handleDisplayDocInfoChange = useCallback(
    (checked: boolean) => {
      editorSetting.set('displayDocInfo', checked);
    },
    [editorSetting]
  );
  const handleDisplayBiDirectionalLinkChange = useCallback(
    (checked: boolean) => {
      editorSetting.set('displayBiDirectionalLink', checked);
    },
    [editorSetting]
  );

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
          checked={settings.fullWidthLayout}
          onChange={handleFullWidthLayoutChange}
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
        <Switch
          data-testid="display-doc-info-trigger"
          checked={settings.displayDocInfo}
          onChange={handleDisplayDocInfoChange}
        />
      </SettingRow>
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.page.display-bi-link.title'
        ]()}
        desc={t[
          'com.affine.settings.editorSettings.page.display-bi-link.description'
        ]()}
      >
        <Switch
          data-testid="display-bi-link-trigger"
          checked={settings.displayBiDirectionalLink}
          onChange={handleDisplayBiDirectionalLinkChange}
        />
      </SettingRow>
    </SettingWrapper>
  );
};
