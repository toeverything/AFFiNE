import {
  Menu,
  MenuItem,
  MenuTrigger,
  RadioGroup,
  type RadioItem,
} from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { useI18n } from '@affine/i18n';
import { useMemo, useState } from 'react';

import { menuTrigger, settingWrapper } from '../style.css';
import { EdgelessSnapshot } from './snapshot';

export const TextSettings = () => {
  const t = useI18n();

  const [textAlignment, setTextAlignment] = useState<
    'left' | 'center' | 'right'
  >('left');

  const alignItems = useMemo<RadioItem[]>(
    () => [
      {
        value: 'left',
        label:
          t[
            'com.affine.settings.editorSettings.edgeless.text.alignment.left'
          ](),
      },
      {
        value: 'center',
        label:
          t[
            'com.affine.settings.editorSettings.edgeless.text.alignment.center'
          ](),
      },
      {
        value: 'right',
        label:
          t[
            'com.affine.settings.editorSettings.edgeless.text.alignment.right'
          ](),
      },
    ],
    [t]
  );

  return (
    <>
      <EdgelessSnapshot
        title={t['com.affine.settings.editorSettings.edgeless.text']()}
        option={['mock-option']}
        type="mock-type"
      />
      <SettingRow
        name={t['com.affine.settings.editorSettings.edgeless.text.color']()}
        desc={''}
      >
        <Menu items={<MenuItem>Blue</MenuItem>}>
          <MenuTrigger className={menuTrigger} disabled>
            Blue
          </MenuTrigger>
        </Menu>
      </SettingRow>
      <SettingRow
        name={t['com.affine.settings.editorSettings.edgeless.text.font']()}
        desc={''}
      >
        <Menu items={<MenuItem>Inter</MenuItem>}>
          <MenuTrigger className={menuTrigger} disabled>
            Inter
          </MenuTrigger>
        </Menu>
      </SettingRow>
      <SettingRow
        name={t['com.affine.settings.editorSettings.edgeless.text.font-size']()}
        desc={''}
      >
        <Menu items={<MenuItem>15px</MenuItem>}>
          <MenuTrigger className={menuTrigger} disabled>
            15px
          </MenuTrigger>
        </Menu>
      </SettingRow>
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.edgeless.text.font-weight'
        ]()}
        desc={''}
      >
        <Menu items={<MenuItem>Regular</MenuItem>}>
          <MenuTrigger className={menuTrigger} disabled>
            Regular
          </MenuTrigger>
        </Menu>
      </SettingRow>
      <SettingRow
        name={t['com.affine.settings.editorSettings.edgeless.text.alignment']()}
        desc={''}
      >
        <RadioGroup
          items={alignItems}
          value={textAlignment}
          width={250}
          className={settingWrapper}
          onChange={setTextAlignment}
        />
      </SettingRow>
    </>
  );
};
