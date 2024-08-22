import { Menu, MenuItem, MenuTrigger, Slider } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { useI18n } from '@affine/i18n';
import { useState } from 'react';

import { menuTrigger } from '../style.css';
import { EdgelessSnapshot } from './snapshot';

export const PenSettings = () => {
  const t = useI18n();
  const [borderThickness, setBorderThickness] = useState<number[]>([3]);
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
        <Menu items={<MenuItem>Yellow</MenuItem>}>
          <MenuTrigger className={menuTrigger} disabled>
            Yellow
          </MenuTrigger>
        </Menu>
      </SettingRow>
      <SettingRow
        name={t['com.affine.settings.editorSettings.edgeless.pen.thickness']()}
        desc={''}
      >
        <Slider
          value={borderThickness}
          onValueChange={setBorderThickness}
          min={1}
          max={5}
          step={1}
          nodes={[1, 2, 3, 4, 5]}
        />
      </SettingRow>
    </>
  );
};
