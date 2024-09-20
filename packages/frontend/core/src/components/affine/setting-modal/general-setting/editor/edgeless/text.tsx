import {
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
  FontWeightMap,
  LineColor,
  LineColorMap,
  TextAlign,
} from '@blocksuite/affine/blocks';
import type { Doc } from '@blocksuite/affine/store';
import { useFramework, useLiveData } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import { DropdownMenu } from '../menu';
import { menuTrigger, settingWrapper } from '../style.css';
import { sortedFontWeightEntries, useColor } from '../utils';
import { Point } from './point';
import { EdgelessSnapshot } from './snapshot';

export const TextSettings = () => {
  const t = useI18n();
  const framework = useFramework();
  const { editorSetting } = framework.get(EditorSettingService);
  const settings = useLiveData(editorSetting.settings$);
  const getColorFromMap = useColor();

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
    return sortedFontWeightEntries.map(([name, value]) => {
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

  const currentColor = useMemo(() => {
    const { color } = settings['affine:edgeless-text'];
    return getColorFromMap(color, LineColorMap);
  }, [getColorFromMap, settings]);

  const getElements = useCallback((doc: Doc) => {
    return doc.getBlocksByFlavour('affine:edgeless-text') || [];
  }, []);

  return (
    <>
      <EdgelessSnapshot
        title={t['com.affine.settings.editorSettings.edgeless.text']()}
        docName="text"
        keyName="affine:edgeless-text"
        getElements={getElements}
      />
      <SettingRow
        name={t['com.affine.settings.editorSettings.edgeless.text.color']()}
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
        name={t[
          'com.affine.settings.editorSettings.edgeless.text.font-family'
        ]()}
        desc={''}
      >
        <DropdownMenu
          items={fontFamilyItems}
          trigger={
            <MenuTrigger className={menuTrigger}>
              {FontFamilyMap[settings['affine:edgeless-text'].fontFamily]}
            </MenuTrigger>
          }
        />
      </SettingRow>
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.edgeless.text.font-style'
        ]()}
        desc={''}
      >
        <DropdownMenu
          items={fontStyleItems}
          trigger={
            <MenuTrigger className={menuTrigger}>
              {String(settings['affine:edgeless-text'].fontStyle)}
            </MenuTrigger>
          }
        />
      </SettingRow>
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.edgeless.text.font-weight'
        ]()}
        desc={''}
      >
        <DropdownMenu
          items={fontWeightItems}
          trigger={
            <MenuTrigger className={menuTrigger}>
              {FontWeightMap[settings['affine:edgeless-text'].fontWeight]}
            </MenuTrigger>
          }
        />
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
