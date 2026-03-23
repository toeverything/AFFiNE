import { SettingHeader } from '@affine/component/setting-components';
import { useI18n } from '@affine/i18n';

import { Edgeless } from './edgeless';
import { AI, General } from './general';
import { Page } from './page';

export const EditorSettings = () => {
  const t = useI18n();

  return (
    <>
      <SettingHeader
        title={t['com.affine.settings.editorSettings.title']()}
        subtitle={t['com.affine.settings.editorSettings.subtitle']()}
      />
      <AI />
      <General />
      <Page />
      <Edgeless />

      {/* // TODO(@EYHN): implement export and import
       <Preferences /> */}
    </>
  );
};
