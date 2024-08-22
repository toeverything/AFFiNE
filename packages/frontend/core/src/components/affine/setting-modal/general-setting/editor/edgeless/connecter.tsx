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

export const ConnecterSettings = () => {
  const t = useI18n();

  const [connecterStyle, setConnecterStyle] = useState<'general' | 'scribbled'>(
    'general'
  );
  const [connectorShape, setConnectorShape] = useState<
    'elbowed' | 'curve' | 'straight'
  >('elbowed');
  const [borderStyle, setBorderStyle] = useState<'solid' | 'dash'>('solid');
  const [borderThickness, setBorderThickness] = useState<number[]>([3]);

  const connecterStyleItems = useMemo<RadioItem[]>(
    () => [
      {
        value: 'general',
        label: t['com.affine.settings.editorSettings.edgeless.style.general'](),
      },
      {
        value: 'scribbled',
        label:
          t['com.affine.settings.editorSettings.edgeless.style.scribbled'](),
      },
    ],
    [t]
  );
  const connecterShapeItems = useMemo<RadioItem[]>(
    () => [
      {
        value: 'elbowed',
        label:
          t[
            'com.affine.settings.editorSettings.edgeless.connecter.connector-shape.elbowed'
          ](),
      },
      {
        value: 'curve',
        label:
          t[
            'com.affine.settings.editorSettings.edgeless.connecter.connector-shape.curve'
          ](),
      },
      {
        value: 'straight',
        label:
          t[
            'com.affine.settings.editorSettings.edgeless.connecter.connector-shape.straight'
          ](),
      },
    ],
    [t]
  );
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
    ],
    [t]
  );
  return (
    <>
      <EdgelessSnapshot
        title={t['com.affine.settings.editorSettings.edgeless.connecter']()}
        option={['mock-option']}
        type="mock-type"
      />
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.edgeless.connecter.color'
        ]()}
        desc={''}
      >
        <Menu items={<MenuItem>Grey</MenuItem>}>
          <MenuTrigger className={menuTrigger} disabled>
            Grey
          </MenuTrigger>
        </Menu>
      </SettingRow>
      <SettingRow
        name={t['com.affine.settings.editorSettings.edgeless.style']()}
        desc={''}
      >
        <RadioGroup
          items={connecterStyleItems}
          value={connecterStyle}
          width={250}
          className={settingWrapper}
          onChange={setConnecterStyle}
        />
      </SettingRow>
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.edgeless.connecter.connector-shape'
        ]()}
        desc={''}
      >
        <RadioGroup
          items={connecterShapeItems}
          value={connectorShape}
          width={250}
          className={settingWrapper}
          onChange={setConnectorShape}
        />
      </SettingRow>
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.edgeless.connecter.border-style'
        ]()}
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
          'com.affine.settings.editorSettings.edgeless.connecter.border-thickness'
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
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.edgeless.connecter.start-endpoint'
        ]()}
        desc={''}
      >
        <Menu items={<MenuItem>None</MenuItem>}>
          <MenuTrigger className={menuTrigger} disabled>
            None
          </MenuTrigger>
        </Menu>
      </SettingRow>
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.edgeless.connecter.end-endpoint'
        ]()}
        desc={''}
      >
        <Menu items={<MenuItem>Arrow</MenuItem>}>
          <MenuTrigger className={menuTrigger} disabled>
            Arrow
          </MenuTrigger>
        </Menu>
      </SettingRow>
    </>
  );
};
