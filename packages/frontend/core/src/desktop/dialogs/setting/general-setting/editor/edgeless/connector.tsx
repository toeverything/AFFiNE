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
import { getSurfaceBlock } from '@blocksuite/affine/blocks/surface';
import {
  ConnectorMode,
  DefaultTheme,
  FontFamily,
  FontFamilyMap,
  FontStyle,
  FontWeightMap,
  PointStyle,
  StrokeStyle,
  TextAlign,
} from '@blocksuite/affine/model';
import type { Store } from '@blocksuite/affine/store';
import { useFramework, useLiveData } from '@toeverything/infra';
import { isEqual } from 'lodash-es';
import { useCallback, useMemo } from 'react';

import { DropdownMenu } from '../menu';
import { menuTrigger, settingWrapper } from '../style.css';
import { sortedFontWeightEntries, usePalettes } from '../utils';
import { Point } from './point';
import { EdgelessSnapshot } from './snapshot';

enum ConnecterStyle {
  General = 'general',
  Scribbled = 'scribbled',
}

enum ConnectorTextFontSize {
  '16px' = '16',
  '20px' = '20',
  '24px' = '24',
  '32px' = '32',
  '40px' = '40',
  '64px' = '64',
}

export const ConnectorSettings = () => {
  const t = useI18n();
  const framework = useFramework();
  const { editorSetting } = framework.get(EditorSettingService);
  const settings = useLiveData(editorSetting.settings$);
  const {
    palettes: StrokeColorShortPalettes,
    getCurrentColor: getCurrentStrokeColor,
  } = usePalettes(
    DefaultTheme.StrokeColorShortPalettes,
    DefaultTheme.connectorColor
  );
  const { palettes: textColorPalettes, getCurrentColor: getCurrentTextColor } =
    usePalettes(DefaultTheme.StrokeColorShortPalettes, DefaultTheme.black);

  const connecterStyleItems = useMemo<RadioItem[]>(
    () => [
      {
        value: ConnecterStyle.General,
        label: t['com.affine.settings.editorSettings.edgeless.style.general'](),
      },
      {
        value: ConnecterStyle.Scribbled,
        label:
          t['com.affine.settings.editorSettings.edgeless.style.scribbled'](),
      },
    ],
    [t]
  );
  const connecterStyle: ConnecterStyle = settings.connector.rough
    ? ConnecterStyle.Scribbled
    : ConnecterStyle.General;
  const setConnecterStyle = useCallback(
    (value: ConnecterStyle) => {
      const isRough = value === ConnecterStyle.Scribbled;
      editorSetting.set('connector', {
        rough: isRough,
      });
    },
    [editorSetting]
  );

  const connectorShapeItems = useMemo<RadioItem[]>(
    () => [
      {
        value: ConnectorMode.Orthogonal as any,
        label:
          t[
            'com.affine.settings.editorSettings.edgeless.connecter.connector-shape.elbowed'
          ](),
      },
      {
        value: ConnectorMode.Curve as any,
        label:
          t[
            'com.affine.settings.editorSettings.edgeless.connecter.connector-shape.curve'
          ](),
      },
      {
        value: ConnectorMode.Straight as any,
        label:
          t[
            'com.affine.settings.editorSettings.edgeless.connecter.connector-shape.straight'
          ](),
      },
    ],
    [t]
  );
  const connectorShape: ConnectorMode = settings.connector.mode;
  const setConnectorShape = useCallback(
    (value: ConnectorMode) => {
      editorSetting.set('connector', {
        mode: value,
      });
    },
    [editorSetting]
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
    ],
    [t]
  );
  const borderStyle: StrokeStyle = settings.connector.strokeStyle;
  const setBorderStyle = useCallback(
    (value: StrokeStyle) => {
      editorSetting.set('connector', {
        strokeStyle: value,
      });
    },
    [editorSetting]
  );

  const borderThickness = settings.connector.strokeWidth;
  const setBorderThickness = useCallback(
    (value: number[]) => {
      editorSetting.set('connector', {
        strokeWidth: value[0],
      });
    },
    [editorSetting]
  );

  const currentColor = useMemo(() => {
    const color = settings.connector.stroke;
    return getCurrentStrokeColor(color);
  }, [getCurrentStrokeColor, settings.connector.stroke]);

  const colorItems = useMemo(() => {
    const { stroke } = settings.connector;
    return StrokeColorShortPalettes.map(({ key, value, resolvedValue }) => {
      const handler = () => {
        editorSetting.set('connector', { stroke: value });
      };
      const isSelected = isEqual(stroke, value);
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
  }, [editorSetting, settings, StrokeColorShortPalettes]);

  const startEndPointItems = useMemo(() => {
    const { frontEndpointStyle } = settings.connector;
    return Object.entries(PointStyle).map(([name, value]) => {
      const handler = () => {
        editorSetting.set('connector', { frontEndpointStyle: value });
      };
      const isSelected = frontEndpointStyle === value;
      return (
        <MenuItem key={name} onSelect={handler} selected={isSelected}>
          {name}
        </MenuItem>
      );
    });
  }, [editorSetting, settings]);

  const endEndPointItems = useMemo(() => {
    const { rearEndpointStyle } = settings.connector;
    return Object.entries(PointStyle).map(([name, value]) => {
      const handler = () => {
        editorSetting.set('connector', { rearEndpointStyle: value });
      };
      const isSelected = rearEndpointStyle === value;
      return (
        <MenuItem key={name} onSelect={handler} selected={isSelected}>
          {name}
        </MenuItem>
      );
    });
  }, [editorSetting, settings]);

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

  const textAlignment = settings.connector.labelStyle.textAlign;
  const setTextAlignment = useCallback(
    (value: TextAlign) => {
      editorSetting.set('connector', {
        labelStyle: {
          textAlign: value,
        },
      });
    },
    [editorSetting]
  );

  const fontFamilyItems = useMemo(() => {
    const { fontFamily } = settings.connector.labelStyle;
    return Object.entries(FontFamily).map(([name, value]) => {
      const handler = () => {
        editorSetting.set('connector', {
          labelStyle: {
            fontFamily: value,
          },
        });
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
    const { fontStyle } = settings.connector.labelStyle;
    return Object.entries(FontStyle).map(([name, value]) => {
      const handler = () => {
        editorSetting.set('connector', {
          labelStyle: {
            fontStyle: value,
          },
        });
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
    const { fontWeight } = settings.connector.labelStyle;
    return sortedFontWeightEntries.map(([name, value]) => {
      const handler = () => {
        editorSetting.set('connector', {
          labelStyle: {
            fontWeight: value,
          },
        });
      };
      const isSelected = fontWeight === value;
      return (
        <MenuItem key={name} onSelect={handler} selected={isSelected}>
          {name}
        </MenuItem>
      );
    });
  }, [editorSetting, settings]);

  const fontSizeItems = useMemo(() => {
    const { fontSize } = settings.connector.labelStyle;
    return Object.entries(ConnectorTextFontSize).map(([name, value]) => {
      const handler = () => {
        editorSetting.set('connector', {
          labelStyle: {
            fontSize: Number(value),
          },
        });
      };
      const isSelected = fontSize === Number(value);
      return (
        <MenuItem key={name} onSelect={handler} selected={isSelected}>
          {name}
        </MenuItem>
      );
    });
  }, [editorSetting, settings]);

  const textColorItems = useMemo(() => {
    const { color } = settings.connector.labelStyle;
    return textColorPalettes.map(({ key, value, resolvedValue }) => {
      const handler = () => {
        editorSetting.set('connector', {
          labelStyle: {
            color: value,
          },
        });
      };
      const isSelected = isEqual(color, value);
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
  }, [editorSetting, settings, textColorPalettes]);

  const textColor = useMemo(() => {
    const { color } = settings.connector.labelStyle;
    return getCurrentTextColor(color);
  }, [getCurrentTextColor, settings]);

  const getElements = useCallback((doc: Store) => {
    const surface = getSurfaceBlock(doc);
    return surface?.getElementsByType('connector') || [];
  }, []);

  return (
    <>
      <EdgelessSnapshot
        title={t['com.affine.settings.editorSettings.edgeless.connecter']()}
        docName="connector"
        keyName="connector"
        getElements={getElements}
      />
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.edgeless.connecter.color'
        ]()}
        desc={''}
      >
        {currentColor ? (
          <DropdownMenu
            items={colorItems}
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
          items={connectorShapeItems}
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
          value={[borderThickness]}
          onValueChange={setBorderThickness}
          min={2}
          max={12}
          step={2}
          nodes={[2, 4, 6, 8, 10, 12]}
        />
      </SettingRow>
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.edgeless.connecter.start-endpoint'
        ]()}
        desc={''}
      >
        <DropdownMenu
          items={startEndPointItems}
          trigger={
            <MenuTrigger className={menuTrigger}>
              {String(settings.connector.frontEndpointStyle)}
            </MenuTrigger>
          }
        />
      </SettingRow>
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.edgeless.connecter.end-endpoint'
        ]()}
        desc={''}
      >
        <DropdownMenu
          items={endEndPointItems}
          trigger={
            <MenuTrigger className={menuTrigger}>
              {String(settings.connector.rearEndpointStyle)}
            </MenuTrigger>
          }
        />
      </SettingRow>
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.edgeless.shape.text-color'
        ]()}
        desc={''}
      >
        {textColor ? (
          <DropdownMenu
            items={textColorItems}
            trigger={
              <MenuTrigger
                className={menuTrigger}
                prefix={<Point color={textColor.resolvedValue} />}
              >
                {textColor.key}
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
              {FontFamilyMap[settings.connector.labelStyle.fontFamily]}
            </MenuTrigger>
          }
        />
      </SettingRow>
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.edgeless.shape.font-size'
        ]()}
        desc={''}
      >
        <DropdownMenu
          items={fontSizeItems}
          trigger={
            <MenuTrigger className={menuTrigger}>
              {settings.connector.labelStyle.fontSize + 'px'}
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
              {settings.connector.labelStyle.fontStyle}
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
              {FontWeightMap[settings.connector.labelStyle.fontWeight]}
            </MenuTrigger>
          }
        />
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
