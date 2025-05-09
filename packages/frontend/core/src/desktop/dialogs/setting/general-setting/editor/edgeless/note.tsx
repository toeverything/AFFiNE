import {
  MenuItem,
  MenuTrigger,
  RadioGroup,
  type RadioItem,
  Slider,
} from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { EditorSettingService } from '@affine/core/modules/editor-setting';
import { useI18n } from '@affine/i18n';
import {
  createEnumMap,
  DefaultTheme,
  NoteShadow,
  NoteShadowMap,
  StrokeStyle,
} from '@blocksuite/affine/model';
import type { Store } from '@blocksuite/affine/store';
import { useFramework, useLiveData } from '@toeverything/infra';
import { isEqual } from 'lodash-es';
import { useCallback, useMemo } from 'react';

import { DropdownMenu } from '../menu';
import { menuTrigger, settingWrapper } from '../style.css';
import { usePalettes } from '../utils';
import { Point } from './point';
import { EdgelessSnapshot } from './snapshot';

enum CornerSize {
  None = 0,
  Small = 8,
  Medium = 16,
  Large = 24,
  Huge = 32,
}

const CornerSizeMap = createEnumMap(CornerSize);

const CORNER_SIZE = [
  { name: 'None', value: CornerSize.None },
  { name: 'Small', value: CornerSize.Small },
  { name: 'Medium', value: CornerSize.Medium },
  { name: 'Large', value: CornerSize.Large },
  { name: 'Huge', value: CornerSize.Huge },
] as const;

export const NoteSettings = () => {
  const t = useI18n();
  const framework = useFramework();
  const { editorSetting } = framework.get(EditorSettingService);
  const settings = useLiveData(editorSetting.settings$);
  const { palettes, getCurrentColor } = usePalettes(
    DefaultTheme.NoteBackgroundColorPalettes,
    DefaultTheme.noteBackgrounColor
  );

  const borderStyleItems = useMemo<RadioItem[]>(
    () => [
      {
        value: StrokeStyle.Solid,
        label:
          t['com.affine.settings.editorSettings.edgeless.note.border.solid'](),
      },
      {
        value: StrokeStyle.Dash,
        label:
          t['com.affine.settings.editorSettings.edgeless.note.border.dash'](),
      },
      {
        value: StrokeStyle.None,
        label:
          t['com.affine.settings.editorSettings.edgeless.note.border.none'](),
      },
    ],
    [t]
  );

  const { borderStyle } = settings['affine:note'].edgeless.style;
  const setBorderStyle = useCallback(
    (value: StrokeStyle) => {
      editorSetting.set('affine:note', {
        edgeless: {
          style: {
            borderStyle: value,
          },
        },
      });
    },
    [editorSetting]
  );

  const { borderSize } = settings['affine:note'].edgeless.style;
  const setBorderSize = useCallback(
    (value: number[]) => {
      editorSetting.set('affine:note', {
        edgeless: {
          style: {
            borderSize: value[0],
          },
        },
      });
    },
    [editorSetting]
  );

  const backgroundItems = useMemo(() => {
    const { background } = settings['affine:note'];
    return palettes.map(({ key, value, resolvedValue }) => {
      const handler = () => {
        editorSetting.set('affine:note', { background: value });
      };
      const isSelected = isEqual(background, value);
      return (
        <MenuItem
          key={key}
          onSelect={handler}
          selected={isSelected}
          prefix={<Point color={resolvedValue} />}
        >
          {key}
        </MenuItem>
      );
    });
  }, [editorSetting, settings, palettes]);

  const cornerItems = useMemo(() => {
    const { borderRadius } = settings['affine:note'].edgeless.style;
    return CORNER_SIZE.map(({ name, value }) => {
      const handler = () => {
        editorSetting.set('affine:note', {
          edgeless: {
            style: {
              borderRadius: value,
            },
          },
        });
      };
      const isSelected = borderRadius === value;
      return (
        <MenuItem key={name} onSelect={handler} selected={isSelected}>
          {name}
        </MenuItem>
      );
    });
  }, [editorSetting, settings]);

  const shadowItems = useMemo(() => {
    const { shadowType } = settings['affine:note'].edgeless.style;
    return Object.entries(NoteShadow).map(([name, value]) => {
      const handler = () => {
        editorSetting.set('affine:note', {
          edgeless: {
            style: {
              shadowType: value,
            },
          },
        });
      };
      const isSelected = shadowType === value;
      return (
        <MenuItem key={name} onSelect={handler} selected={isSelected}>
          {name}
        </MenuItem>
      );
    });
  }, [editorSetting, settings]);

  const currentColor = useMemo(() => {
    const { background } = settings['affine:note'];
    return getCurrentColor(background);
  }, [getCurrentColor, settings]);

  const getElements = useCallback((doc: Store) => {
    return doc.getBlocksByFlavour('affine:note') || [];
  }, []);

  return (
    <>
      <EdgelessSnapshot
        title={t['com.affine.settings.editorSettings.edgeless.note']()}
        docName="note"
        keyName="affine:note"
        getElements={getElements}
        height={240}
      />
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.edgeless.note.background'
        ]()}
        desc={''}
      >
        {currentColor ? (
          <DropdownMenu
            items={backgroundItems}
            trigger={
              <MenuTrigger
                className={menuTrigger}
                prefix={<Point color={currentColor.resolvedValue} />}
              >
                {currentColor.key}
              </MenuTrigger>
            }
          />
        ) : null}
      </SettingRow>
      <SettingRow
        name={t['com.affine.settings.editorSettings.edgeless.note.corners']()}
        desc={''}
      >
        <DropdownMenu
          items={cornerItems}
          trigger={
            <MenuTrigger className={menuTrigger}>
              {
                CornerSizeMap[
                  settings['affine:note'].edgeless.style
                    .borderRadius as CornerSize
                ]
              }
            </MenuTrigger>
          }
        />
      </SettingRow>
      <SettingRow
        name={t['com.affine.settings.editorSettings.edgeless.note.shadow']()}
        desc={''}
      >
        <DropdownMenu
          items={shadowItems}
          trigger={
            <MenuTrigger className={menuTrigger}>
              {NoteShadowMap[settings['affine:note'].edgeless.style.shadowType]}
            </MenuTrigger>
          }
        />
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
          value={[borderSize]}
          onValueChange={setBorderSize}
          min={2}
          max={12}
          step={2}
          nodes={[2, 4, 6, 8, 10, 12]}
          disabled={borderStyle === StrokeStyle.None}
        />
      </SettingRow>
    </>
  );
};
