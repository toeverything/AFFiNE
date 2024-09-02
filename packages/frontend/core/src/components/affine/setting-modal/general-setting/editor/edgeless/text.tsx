import {
  Menu,
  MenuItem,
  MenuTrigger,
  RadioGroup,
  type RadioItem,
} from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { EditorSettingService } from '@affine/core/modules/editor-settting';
import { useI18n } from '@affine/i18n';
import {
  FontFamily,
  FontFamilyMap,
  FontStyle,
  FontWeight,
  LineColor,
  TextAlign,
} from '@blocksuite/blocks';
import { useFramework, useLiveData } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import { menuTrigger, settingWrapper } from '../style.css';
import { EdgelessSnapshot } from './snapshot';

export const TextSettings = () => {
  const t = useI18n();
  const framework = useFramework();
  const { editorSetting } = framework.get(EditorSettingService);
  const settings = useLiveData(editorSetting.settings$);

  const alignItems = useMemo<RadioItem[]>(
    () => [
      {
        value: TextAlign.Left,
        label:
          t[
            'com.affine.settings.editorSettings.edgeless.text.alignment.left'
          ](),
      },
      {
        value: TextAlign.Center,
        label:
          t[
            'com.affine.settings.editorSettings.edgeless.text.alignment.center'
          ](),
      },
      {
        value: TextAlign.Right,
        label:
          t[
            'com.affine.settings.editorSettings.edgeless.text.alignment.right'
          ](),
      },
    ],
    [t]
  );

  const { textAlign } = settings['affine:edgeless-text'];
  const setTextAlign = useCallback(
    (value: TextAlign) => {
      editorSetting.set('affine:edgeless-text', {
        textAlign: value,
      });
    },
    [editorSetting]
  );

  const colorItems = useMemo(() => {
    const { color } = settings['affine:edgeless-text'];
    return Object.entries(LineColor).map(([name, value]) => {
      const handler = () => {
        editorSetting.set('affine:edgeless-text', { color: value });
      };
      const isSelected = color === value;
      return (
        <MenuItem key={name} onSelect={handler} selected={isSelected}>
          {name}
        </MenuItem>
      );
    });
  }, [editorSetting, settings]);

  const fontFamilyItems = useMemo(() => {
    const { fontFamily } = settings['affine:edgeless-text'];
    return Object.entries(FontFamily).map(([name, value]) => {
      const handler = () => {
        editorSetting.set('affine:edgeless-text', { fontFamily: value });
      };
      const isSelected = fontFamily === value;
      return (
        <MenuItem key={name} onSelect={handler} selected={isSelected}>
          {name}
        </MenuItem>
      );
    });
  }, [editorSetting, settings]);

  const fontStyleItems = useMemo(() => {
    const { fontStyle } = settings['affine:edgeless-text'];
    return Object.entries(FontStyle).map(([name, value]) => {
      const handler = () => {
        editorSetting.set('affine:edgeless-text', { fontStyle: value });
      };
      const isSelected = fontStyle === value;
      return (
        <MenuItem key={name} onSelect={handler} selected={isSelected}>
          {name}
        </MenuItem>
      );
    });
  }, [editorSetting, settings]);

  const fontWeightItems = useMemo(() => {
    const { fontWeight } = settings['affine:edgeless-text'];
    return Object.entries(FontWeight).map(([name, value]) => {
      const handler = () => {
        editorSetting.set('affine:edgeless-text', { fontWeight: value });
      };
      const isSelected = fontWeight === value;
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
        title={t['com.affine.settings.editorSettings.edgeless.text']()}
        option={['mock-option']}
        type="mock-type"
      />
      <SettingRow
        name={t['com.affine.settings.editorSettings.edgeless.text.color']()}
        desc={''}
      >
        <Menu items={colorItems}>
          <MenuTrigger className={menuTrigger}>
            {String(settings['affine:edgeless-text'].color)}
          </MenuTrigger>
        </Menu>
      </SettingRow>
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.edgeless.text.font-family'
        ]()}
        desc={''}
      >
        <Menu items={fontFamilyItems}>
          <MenuTrigger className={menuTrigger}>
            {FontFamilyMap[settings['affine:edgeless-text'].fontFamily]}
          </MenuTrigger>
        </Menu>
      </SettingRow>
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.edgeless.text.font-style'
        ]()}
        desc={''}
      >
        <Menu items={fontStyleItems}>
          <MenuTrigger className={menuTrigger}>
            {String(settings['affine:edgeless-text'].fontStyle)}
          </MenuTrigger>
        </Menu>
      </SettingRow>
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.edgeless.text.font-weight'
        ]()}
        desc={''}
      >
        <Menu items={fontWeightItems}>
          <MenuTrigger className={menuTrigger}>
            {settings['affine:edgeless-text'].fontWeight}
          </MenuTrigger>
        </Menu>
      </SettingRow>
      <SettingRow
        name={t['com.affine.settings.editorSettings.edgeless.text.alignment']()}
        desc={''}
      >
        <RadioGroup
          items={alignItems}
          value={textAlign}
          width={250}
          className={settingWrapper}
          onChange={setTextAlign}
        />
      </SettingRow>
    </>
  );
};
