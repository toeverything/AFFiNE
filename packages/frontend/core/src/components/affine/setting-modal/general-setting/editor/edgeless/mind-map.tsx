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

export const MindMapSettings = () => {
  const t = useI18n();
  const [layoutValue, setLayoutValue] = useState<'left' | 'radial' | 'right'>(
    'right'
  );
  const layoutValueItems = useMemo<RadioItem[]>(
    () => [
      {
        value: 'left',
        label:
          t[
            'com.affine.settings.editorSettings.edgeless.mind-map.layout.left'
          ](),
      },
      {
        value: 'radial',
        label:
          t[
            'com.affine.settings.editorSettings.edgeless.mind-map.layout.radial'
          ](),
      },
      {
        value: 'right',
        label:
          t[
            'com.affine.settings.editorSettings.edgeless.mind-map.layout.right'
          ](),
      },
    ],
    [t]
  );
  return (
    <>
      <EdgelessSnapshot
        title={t['com.affine.settings.editorSettings.edgeless.mind-map']()}
        option={['mock-option']}
        type="mock-type"
      />
      <SettingRow
        name={t['com.affine.settings.editorSettings.edgeless.style']()}
        desc={''}
      >
        <Menu items={<MenuItem>Style 1</MenuItem>}>
          <MenuTrigger className={menuTrigger} disabled>
            Style 1
          </MenuTrigger>
        </Menu>
      </SettingRow>
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.edgeless.mind-map.layout'
        ]()}
        desc={''}
      >
        <RadioGroup
          items={layoutValueItems}
          value={layoutValue}
          width={250}
          className={settingWrapper}
          onChange={setLayoutValue}
        />
      </SettingRow>
    </>
  );
};
