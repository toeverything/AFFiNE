import type { EditorSettingSchema } from '@affine/core/modules/editor-settting';
import { EditorSettingService } from '@affine/core/modules/editor-settting';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

export function useEditorSettingsHelper() {
  const editorSetting = useService(EditorSettingService).editorSetting;
  const settings = useLiveData(editorSetting.settings$);

  const updateSettings = useCallback(
    <K extends keyof EditorSettingSchema>(
      key: K,
      value: EditorSettingSchema[K]
    ) => {
      editorSetting.set(key, value);
    },
    [editorSetting]
  );

  return useMemo(
    () => ({
      settings,
      updateSettings,
    }),
    [settings, updateSettings]
  );
}
