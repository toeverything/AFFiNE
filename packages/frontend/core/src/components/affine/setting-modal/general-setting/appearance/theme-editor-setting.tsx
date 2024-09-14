import { Button } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { ThemeEditorService } from '@affine/core/modules/theme-editor';
import { popupWindow } from '@affine/core/utils';
import { apis } from '@affine/electron-api';
import { DeleteIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import { useCallback } from 'react';

export const ThemeEditorSetting = () => {
  const themeEditor = useService(ThemeEditorService);
  const modified = useLiveData(themeEditor.modified$);

  const open = useCallback(() => {
    if (BUILD_CONFIG.isElectron) {
      apis?.ui.openThemeEditor().catch(console.error);
    } else {
      popupWindow('/theme-editor');
    }
  }, []);

  return (
    <SettingRow
      name="Customize Theme"
      desc="Edit all AFFiNE theme variables here"
    >
      <div style={{ display: 'flex', gap: 16 }}>
        {modified ? (
          <Button
            style={{
              color: cssVar('errorColor'),
              borderColor: cssVar('errorColor'),
            }}
            prefixStyle={{
              color: cssVar('errorColor'),
            }}
            onClick={() => themeEditor.reset()}
            variant="secondary"
            prefix={<DeleteIcon />}
          >
            Reset all
          </Button>
        ) : null}
        <Button onClick={open}>Open Theme Editor</Button>
      </div>
    </SettingRow>
  );
};
