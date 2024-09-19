import { MenuItem, MenuTrigger, Slider } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { EditorSettingService } from '@affine/core/modules/editor-settting';
import { useI18n } from '@affine/i18n';
import { LineColor, LineColorMap } from '@blocksuite/affine/blocks';
import type { Doc } from '@blocksuite/affine/store';
import { useFramework, useLiveData } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import { DropdownMenu } from '../menu';
import { menuTrigger } from '../style.css';
import { useColor } from '../utils';
import { Point } from './point';
import { EdgelessSnapshot } from './snapshot';
import { getSurfaceBlock } from './utils';

export const PenSettings = () => {
  const t = useI18n();
  const framework = useFramework();
  const { editorSetting } = framework.get(EditorSettingService);
  const settings = useLiveData(editorSetting.settings$);
  const getColorFromMap = useColor();

  const currentColor = useMemo(() => {
    return getColorFromMap(settings.brush.color, LineColorMap);
  }, [getColorFromMap, settings.brush.color]);

  const colorItems = useMemo(() => {
    const { color } = settings.brush;
    return Object.entries(LineColor).map(([name, value]) => {
      const handler = () => {
        editorSetting.set('brush', { color: value });
      };
      const isSelected = color === value;
      return (
        <MenuItem
          key={name}
          onSelect={handler}
          selected={isSelected}
          prefix={<Point color={value} />}
        >
          {name}
        </MenuItem>
      );
    });
  }, [editorSetting, settings.brush]);

  const borderThickness = settings.brush.lineWidth;
  const setBorderThickness = useCallback(
    (value: number[]) => {
      editorSetting.set('brush', {
        lineWidth: value[0],
      });
    },
    [editorSetting]
  );

  const getElements = useCallback((doc: Doc) => {
    const surface = getSurfaceBlock(doc);
    return surface?.getElementsByType('brush') || [];
  }, []);

  return (
    <>
      <EdgelessSnapshot
        title={t['com.affine.settings.editorSettings.edgeless.pen']()}
        docName="pen"
        keyName="brush"
        getElements={getElements}
      />
      <SettingRow
        name={t['com.affine.settings.editorSettings.edgeless.pen.color']()}
        desc={''}
      >
        {currentColor ? (
          <DropdownMenu
            items={colorItems}
            trigger={
              <MenuTrigger
                className={menuTrigger}
                prefix={<Point color={currentColor.value} />}
              >
                {currentColor.key}
              </MenuTrigger>
            }
          />
        ) : null}
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
