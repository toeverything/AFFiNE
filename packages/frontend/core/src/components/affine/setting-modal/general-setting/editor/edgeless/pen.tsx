import { Menu, MenuItem, MenuTrigger, Slider } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { EditorSettingService } from '@affine/core/modules/editor-settting';
import { useI18n } from '@affine/i18n';
import { LineColor } from '@blocksuite/blocks';
import { useFramework, useLiveData } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import { menuTrigger } from '../style.css';
import { EdgelessSnapshot } from './snapshot';

export const PenSettings = () => {
  const t = useI18n();
  const framework = useFramework();
  const { editorSetting } = framework.get(EditorSettingService);
  const settings = useLiveData(editorSetting.settings$);

  const colorItems = useMemo(() => {
    const { color } = settings.brush;
    return Object.entries(LineColor).map(([name, value]) => {
      const handler = () => {
        editorSetting.set('brush', { color: value });
      };
      const isSelected = color === value;
      return (
        <MenuItem key={name} onSelect={handler} selected={isSelected}>
          {name}
        </MenuItem>
      );
    });
  }, [editorSetting, settings]);

  const borderThickness = settings.brush.lineWidth;
  const setBorderThickness = useCallback(
    (value: number[]) => {
      editorSetting.set('brush', {
        lineWidth: value[0],
      });
    },
    [editorSetting]
  );

  return (
    <>
      <EdgelessSnapshot
        title={t['com.affine.settings.editorSettings.edgeless.pen']()}
        option={['mock-option']}
        type="mock-type"
      />
      <SettingRow
        name={t['com.affine.settings.editorSettings.edgeless.pen.color']()}
        desc={''}
      >
        <Menu items={colorItems}>
          <MenuTrigger className={menuTrigger}>
            {String(settings.brush.color)}
          </MenuTrigger>
        </Menu>
      </SettingRow>
      <SettingRow
        name={t['com.affine.settings.editorSettings.edgeless.pen.thickness']()}
        desc={''}
      >
        <Slider
          value={[borderThickness]}
          onValueChange={setBorderThickness}
          min={2}
          max={12}
          step={2}
          nodes={[2, 4, 6, 8, 10, 12]}
        />
      </SettingRow>
    </>
  );
};
