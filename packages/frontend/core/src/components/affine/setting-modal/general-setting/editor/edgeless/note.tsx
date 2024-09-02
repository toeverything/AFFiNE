import {
  Menu,
  MenuItem,
  MenuTrigger,
  RadioGroup,
  type RadioItem,
  Slider,
} from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { EditorSettingService } from '@affine/core/modules/editor-settting';
import { useI18n } from '@affine/i18n';
import {
  NoteBackgroundColor,
  NoteShadow,
  StrokeStyle,
} from '@blocksuite/blocks';
import { useFramework, useLiveData } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import { menuTrigger, settingWrapper } from '../style.css';
import { EdgelessSnapshot } from './snapshot';

const CORNER_SIZE = [
  { name: 'None', value: 0 },
  { name: 'Small', value: 8 },
  { name: 'Medium', value: 16 },
  { name: 'Large', value: 24 },
  { name: 'Huge', value: 32 },
] as const;

export const NoteSettings = () => {
  const t = useI18n();
  const framework = useFramework();
  const { editorSetting } = framework.get(EditorSettingService);
  const settings = useLiveData(editorSetting.settings$);

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
    return Object.entries(NoteBackgroundColor).map(([name, value]) => {
      const handler = () => {
        editorSetting.set('affine:note', { background: value });
      };
      const isSelected = background === value;
      return (
        <MenuItem key={name} onSelect={handler} selected={isSelected}>
          {name}
        </MenuItem>
      );
    });
  }, [editorSetting, settings]);

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
        <Menu items={backgroundItems}>
          <MenuTrigger className={menuTrigger}>
            {String(settings['affine:note'].background)}
          </MenuTrigger>
        </Menu>
      </SettingRow>
      <SettingRow
        name={t['com.affine.settings.editorSettings.edgeless.note.corners']()}
        desc={''}
      >
        <Menu items={cornerItems}>
          <MenuTrigger className={menuTrigger}>
            {String(settings['affine:note'].edgeless.style.borderRadius)}
          </MenuTrigger>
        </Menu>
      </SettingRow>
      <SettingRow
        name={t['com.affine.settings.editorSettings.edgeless.note.shadow']()}
        desc={''}
      >
        <Menu items={shadowItems}>
          <MenuTrigger className={menuTrigger}>
            {String(settings['affine:note'].edgeless.style.shadowType)}
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
          value={[borderSize]}
          onValueChange={setBorderSize}
          min={2}
          max={12}
          step={2}
          nodes={[2, 4, 6, 8, 10, 12]}
        />
      </SettingRow>
    </>
  );
};
