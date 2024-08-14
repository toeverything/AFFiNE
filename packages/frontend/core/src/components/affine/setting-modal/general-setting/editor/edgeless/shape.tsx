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

import { menuTrigger, settingWrapper, shapeIndicator } from '../style.css';
import { EdgelessSnapshot } from './snapshot';

type Shape =
  | 'square'
  | 'ellipse'
  | 'diamond'
  | 'triangle'
  | 'rounded-rectangle';

export const ShapeSettings = () => {
  const t = useI18n();
  const [currentShape, setCurrentShape] = useState<Shape>('square');
  const [shapeStyle, setShapeStyle] = useState<'general' | 'scribbled'>(
    'general'
  );
  const [borderStyle, setBorderStyle] = useState<'solid' | 'dash' | 'none'>(
    'solid'
  );
  const [borderThickness, setBorderThickness] = useState<number[]>([3]);
  const [textAlignment, setTextAlignment] = useState<
    'left' | 'center' | 'right'
  >('left');

  const shapeStyleItems = useMemo<RadioItem[]>(
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

  const shapes = useMemo<RadioItem[]>(
    () => [
      {
        value: 'square',
        label: t['com.affine.settings.editorSettings.edgeless.shape.square'](),
      },
      {
        value: 'ellipse',
        label: t['com.affine.settings.editorSettings.edgeless.shape.ellipse'](),
      },
      {
        value: 'diamond',
        label: t['com.affine.settings.editorSettings.edgeless.shape.diamond'](),
      },
      {
        value: 'triangle',
        label:
          t['com.affine.settings.editorSettings.edgeless.shape.triangle'](),
      },
      {
        value: 'rounded-rectangle',
        label:
          t[
            'com.affine.settings.editorSettings.edgeless.shape.rounded-rectangle'
          ](),
      },
    ],
    [t]
  );

  return (
    <>
      <EdgelessSnapshot
        title={t['com.affine.settings.editorSettings.edgeless.shape']()}
        option={['mock-option']}
        type="mock-type"
      />

      <RadioGroup
        padding={0}
        gap={4}
        itemHeight={28}
        borderRadius={8}
        value={currentShape}
        items={shapes}
        onChange={setCurrentShape}
        style={{ background: 'transparent', marginBottom: '16px' }}
        indicatorClassName={shapeIndicator}
      />
      <SettingRow
        name={t['com.affine.settings.editorSettings.edgeless.style']()}
        desc={''}
      >
        <RadioGroup
          items={shapeStyleItems}
          value={shapeStyle}
          width={250}
          className={settingWrapper}
          onChange={setShapeStyle}
        />
      </SettingRow>
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.edgeless.shape.fill-color'
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
        name={t[
          'com.affine.settings.editorSettings.edgeless.shape.border-color'
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
        name={t[
          'com.affine.settings.editorSettings.edgeless.shape.border-style'
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
          'com.affine.settings.editorSettings.edgeless.shape.border-thickness'
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
          'com.affine.settings.editorSettings.edgeless.shape.text-color'
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
        name={t['com.affine.settings.editorSettings.edgeless.shape.font']()}
        desc={''}
      >
        <Menu items={<MenuItem>Inter</MenuItem>}>
          <MenuTrigger className={menuTrigger} disabled>
            Inter
          </MenuTrigger>
        </Menu>
      </SettingRow>
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.edgeless.shape.font-size'
        ]()}
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
          'com.affine.settings.editorSettings.edgeless.shape.font-style'
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
        name={t[
          'com.affine.settings.editorSettings.edgeless.shape.text-alignment'
        ]()}
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
