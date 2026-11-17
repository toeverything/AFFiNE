import { SettingHeader } from '@affine/component/setting-components';
import { useI18n } from '@affine/i18n';

import { Edgeless } from './edgeless';
import { General } from './general';
import { Page } from './page';
import { TaskWorkflow } from './task-workflow';

export const EditorSettings = () => {
  const t = useI18n();

  return (
    <>
      <SettingHeader
        title={t['com.affine.settings.editorSettings.title']()}
        subtitle={t['com.affine.settings.editorSettings.subtitle']()}
      />
      <General />
      <Page />
      <Edgeless />
      <TaskWorkflow />

      {/* // TODO(@EYHN): implement export and import
       <Preferences /> */}
    </>
  );
};
