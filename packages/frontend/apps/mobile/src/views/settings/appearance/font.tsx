import { getBaseFontStyleOptions } from '@affine/core/components/affine/setting-modal/general-setting/editor/general';
import {
  EditorSettingService,
  type FontFamily,
} from '@affine/core/modules/editor-settting';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import { SettingDropdownSelect } from '../dropdown-select';
import { RowLayout } from '../row.layout';

export const FontStyleSetting = () => {
  const t = useI18n();
  const editorSetting = useService(EditorSettingService).editorSetting;
  const fontFamily = useLiveData(
    editorSetting.settings$.selector(s => s.fontFamily)
  );

  const options = useMemo(() => getBaseFontStyleOptions(t), [t]);
  const handleEdit = useCallback(
    (v: FontFamily) => {
      editorSetting.set('fontFamily', v);
    },
    [editorSetting]
  );

  return (
    <RowLayout label={t['com.affine.mobile.setting.appearance.font']()}>
      <SettingDropdownSelect<FontFamily>
        options={options}
        value={fontFamily}
        onChange={handleEdit}
      />
    </RowLayout>
  );
};
