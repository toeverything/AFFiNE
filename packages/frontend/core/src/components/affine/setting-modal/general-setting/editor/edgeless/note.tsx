import {
  Menu,
  MenuItem,
  MenuTrigger,
  RadioGroup,
  type RadioItem,
  Slider,
} from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { useI18n } from '@affine/i18n';
import { useMemo, useState } from 'react';

import { menuTrigger, settingWrapper } from '../style.css';
import { EdgelessSnapshot } from './snapshot';

export const NoteSettings = () => {
  const t = useI18n();
  const [borderStyle, setBorderStyle] = useState<'solid' | 'dash' | 'none'>(
    'solid'
  );
  const [borderThickness, setBorderThickness] = useState<number[]>([3]);

  const borderStyleItems = useMemo<RadioItem[]>(
    () => [
      {
        value: 'solid',
        label:
          t['com.affine.settings.editorSettings.edgeless.note.border.solid'](),
      },
      {
        value: 'dash',
        label:
          t['com.affine.settings.editorSettings.edgeless.note.border.dash'](),
      },
      {
        value: 'none',
        label:
          t['com.affine.settings.editorSettings.edgeless.note.border.none'](),
      },
    ],
    [t]
  );
  return (
    <>
      <EdgelessSnapshot
        title={t['com.affine.settings.editorSettings.edgeless.note']()}
        option={['mock-option']}
        type="mock-type"
      />
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.edgeless.note.background'
        ]()}
        desc={''}
      >
        <Menu items={<MenuItem>Yellow</MenuItem>}>
          <MenuTrigger className={menuTrigger} disabled>
            Yellow
          </MenuTrigger>
        </Menu>
      </SettingRow>
      <SettingRow
        name={t['com.affine.settings.editorSettings.edgeless.note.corners']()}
        desc={''}
      >
        <Menu items={<MenuItem>Small</MenuItem>}>
          <MenuTrigger className={menuTrigger} disabled>
            Small
          </MenuTrigger>
        </Menu>
      </SettingRow>
      <SettingRow
        name={t['com.affine.settings.editorSettings.edgeless.note.shadow']()}
        desc={''}
      >
        <Menu items={<MenuItem>Box shadow</MenuItem>}>
          <MenuTrigger className={menuTrigger} disabled>
            Box shadow
          </MenuTrigger>
        </Menu>
      </SettingRow>
      <SettingRow
        name={t['com.affine.settings.editorSettings.edgeless.note.border']()}
        desc={''}
      >
        <RadioGroup
          items={borderStyleItems}
          value={borderStyle}
          width={250}
          className={settingWrapper}
          onChange={setBorderStyle}
        />
      </SettingRow>
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.edgeless.note.border-thickness'
        ]()}
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
