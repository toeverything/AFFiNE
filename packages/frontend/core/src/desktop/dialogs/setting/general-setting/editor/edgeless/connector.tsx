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
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useMemo,
} from 'react';

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

type EndpointSide = 'start' | 'end';
type ConnectorEndpointStyle = string;

const DRAWIO_MARKERS = [
  'classic',
  'classicThin',
  'open',
  'openThin',
  'block',
  'blockThin',
  'oval',
  'diamond',
  'diamondThin',
  'doubleBlock',
  'box',
  'halfCircle',
  'openAsync',
  'async',
  'dash',
  'baseDash',
  'cross',
  'circle',
  'circlePlus',
  'ERone',
  'ERmandOne',
  'ERmany',
  'ERoneToMany',
  'ERzeroToOne',
  'ERzeroToMany',
] as const;

const labelize = (value: string) => {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, char => char.toUpperCase())
    .trim();
};

const ENDPOINT_STYLE_OPTIONS: {
  value: ConnectorEndpointStyle;
  label: string;
}[] = [
  { value: PointStyle.None, label: 'None' },
  { value: PointStyle.Arrow, label: 'Arrow' },
  { value: PointStyle.Triangle, label: 'Triangle' },
  { value: PointStyle.Circle, label: 'Circle' },
  { value: PointStyle.Diamond, label: 'Diamond' },
  ...DRAWIO_MARKERS.map(value => ({ value, label: labelize(value) })),
];

const MARKER_ICON_PATHS: Record<
  string,
  { path: string; strokeOnly?: boolean }
> = {
  None: { path: 'M 3 8 L 13 8', strokeOnly: true },
  Arrow: { path: 'M 0 8 L 8 3 L 8 13 Z' },
  Triangle: { path: 'M 0 8 L 7 4 L 7 12 Z' },
  Circle: {
    path: 'M 0 8 A 5 5 0 0 1 5 3 A 5 5 0 0 1 10 8 A 5 5 0 0 1 5 13 A 5 5 0 0 1 0 8 Z',
    strokeOnly: true,
  },
  Diamond: { path: 'M 0 8 L 5 3 L 10 8 L 5 13 Z', strokeOnly: true },
  classic: { path: 'M 0 8 L 10 2 L 5 8 L 10 14 Z' },
  classicThin: { path: 'M 0 8 L 8 4 L 5 8 L 8 12 Z' },
  open: { path: 'M 8 0 L 0 8 L 8 16', strokeOnly: true },
  openThin: { path: 'M 8 4 L 0 8 L 8 12', strokeOnly: true },
  block: { path: 'M 0 8 L 8 2 L 8 14 Z' },
  blockThin: { path: 'M 0 8 L 8 4 L 8 12 Z' },
  oval: {
    path: 'M 0 8 A 5 5 0 0 1 5 3 A 5 5 0 0 1 11 8 A 5 5 0 0 1 5 13 A 5 5 0 0 1 0 8 Z',
  },
  diamond: { path: 'M 0 8 L 6 2 L 12 8 L 6 14 Z' },
  diamondThin: { path: 'M 0 8 L 8 3 L 16 8 L 8 13 Z' },
  doubleBlock: { path: 'M 0 8 L 8 2 L 8 14 Z M 8 8 L 16 2 L 16 14 Z' },
  box: { path: 'M 0 3 L 10 3 L 10 13 L 0 13 Z' },
  halfCircle: {
    path: 'M 0 3 A 5 5 0 0 1 5 8 A 5 5 0 0 1 0 13',
    strokeOnly: true,
  },
  openAsync: { path: 'M 8 4 L 0 8 L 24 8', strokeOnly: true },
  async: { path: 'M 6 8 L 6 4 L 0 8 L 24 8' },
  dash: { path: 'M 0 2 L 12 14', strokeOnly: true },
  baseDash: { path: 'M 0 2 L 0 14', strokeOnly: true },
  cross: { path: 'M 0 2 L 12 14 M 12 2 L 0 14', strokeOnly: true },
  circle: {
    path: 'M 0 8 A 6 6 0 0 1 6 2 A 6 6 0 0 1 12 8 A 6 6 0 0 1 6 14 A 6 6 0 0 1 0 8 Z',
    strokeOnly: true,
  },
  circlePlus: {
    path: 'M 0 8 A 6 6 0 0 1 6 2 A 6 6 0 0 1 12 8 A 6 6 0 0 1 6 14 A 6 6 0 0 1 0 8 Z M 6 2 L 6 14',
    strokeOnly: true,
  },
  ERone: { path: 'M 5 2 L 5 14', strokeOnly: true },
  ERmandOne: { path: 'M 6 2 L 6 14 M 9 2 L 9 14', strokeOnly: true },
  ERmany: { path: 'M 0 2 L 12 8 L 0 14', strokeOnly: true },
  ERoneToMany: { path: 'M 0 2 L 12 8 L 0 14 M 15 2 L 15 14', strokeOnly: true },
  ERzeroToOne: {
    path: 'M 8 8 A 5 5 0 0 1 13 3 A 5 5 0 0 1 18 8 A 5 5 0 0 1 13 13 A 5 5 0 0 1 8 8 Z M 4 3 L 4 13',
    strokeOnly: true,
  },
  ERzeroToMany: {
    path: 'M 8 8 A 5 5 0 0 1 13 3 A 5 5 0 0 1 18 8 A 5 5 0 0 1 13 13 A 5 5 0 0 1 8 8 Z M 0 3 L 8 8 L 0 13',
    strokeOnly: true,
  },
};

const getEndpointStyleLabel = (value: ConnectorEndpointStyle) => {
  return (
    ENDPOINT_STYLE_OPTIONS.find(option => option.value === value)?.label ??
    labelize(value)
  );
};

const renderEndpointMarker = (style: ConnectorEndpointStyle): ReactNode => {
  const marker = MARKER_ICON_PATHS[style];
  if (!marker || !marker.path) return null;

  return (
    <path
      d={marker.path}
      stroke="currentColor"
      strokeWidth="1.5"
      fill={marker.strokeOnly ? 'none' : 'currentColor'}
      strokeLinecap="round"
      strokeLinejoin="round"
      transform="translate(4,2)"
    />
  );
};

const EndpointStyleIcon = ({
  style,
  side,
}: {
  style: ConnectorEndpointStyle;
  side: EndpointSide;
}) => {
  const isStart = side === 'start';

  return (
    <svg
      width="24"
      height="16"
      viewBox="0 0 24 16"
      fill="none"
      style={isStart ? { transform: 'scaleX(-1)' } : undefined}
    >
      {renderEndpointMarker(style)}
    </svg>
  );
};

const ENDPOINT_MENU_CONTENT_STYLE: CSSProperties = {
  maxHeight: '320px',
  overflowY: 'auto',
};

const endpointIconPrefixStyle: CSSProperties = {
  width: '28px',
  display: 'inline-flex',
  justifyContent: 'center',
  alignItems: 'center',
};

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
        testId: 'connector-shape-elbowed-trigger',
        label:
          t[
            'com.affine.settings.editorSettings.edgeless.connecter.connector-shape.elbowed'
          ](),
      },
      {
        value: ConnectorMode.Rounded as any,
        testId: 'connector-shape-rounded-trigger',
        label: 'Rounded',
      },
      {
        value: ConnectorMode.Curve as any,
        testId: 'connector-shape-curve-trigger',
        label:
          t[
            'com.affine.settings.editorSettings.edgeless.connecter.connector-shape.curve'
          ](),
      },
      {
        value: ConnectorMode.Straight as any,
        testId: 'connector-shape-straight-trigger',
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
        testId: 'connector-border-style-solid-trigger',
        label:
          t['com.affine.settings.editorSettings.edgeless.note.border.solid'](),
      },
      {
        value: StrokeStyle.Dash,
        testId: 'connector-border-style-dash-trigger',
        label:
          t['com.affine.settings.editorSettings.edgeless.note.border.dash'](),
      },
      {
        value: StrokeStyle.Dot,
        testId: 'connector-border-style-dot-trigger',
        label: 'Dot',
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

  const cornerRadius = settings.connector.cornerRadius;
  const setCornerRadius = useCallback(
    (value: number[]) => {
      editorSetting.set('connector', {
        cornerRadius: value[0],
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
    return ENDPOINT_STYLE_OPTIONS.map(({ value, label }) => {
      const handler = () => {
        editorSetting.set('connector', {
          frontEndpointStyle: value as PointStyle,
        });
      };
      const isSelected = frontEndpointStyle === value;
      return (
        <MenuItem
          key={value}
          onSelect={handler}
          selected={isSelected}
          prefix={
            <span style={endpointIconPrefixStyle}>
              <EndpointStyleIcon style={value} side="start" />
            </span>
          }
        >
          {label}
        </MenuItem>
      );
    });
  }, [editorSetting, settings]);

  const endEndPointItems = useMemo(() => {
    const { rearEndpointStyle } = settings.connector;
    return ENDPOINT_STYLE_OPTIONS.map(({ value, label }) => {
      const handler = () => {
        editorSetting.set('connector', {
          rearEndpointStyle: value as PointStyle,
        });
      };
      const isSelected = rearEndpointStyle === value;
      return (
        <MenuItem
          key={value}
          onSelect={handler}
          selected={isSelected}
          prefix={
            <span style={endpointIconPrefixStyle}>
              <EndpointStyleIcon style={value} side="end" />
            </span>
          }
        >
          {label}
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

  const selectedFrontEndpointStyle = settings.connector
    .frontEndpointStyle as ConnectorEndpointStyle;
  const selectedRearEndpointStyle = settings.connector
    .rearEndpointStyle as ConnectorEndpointStyle;

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
          disabled={borderStyle === StrokeStyle.None}
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
          contentStyle={ENDPOINT_MENU_CONTENT_STYLE}
          trigger={
            <MenuTrigger
              data-testid="connector-start-endpoint-trigger"
              className={menuTrigger}
              prefix={
                <span style={endpointIconPrefixStyle}>
                  <EndpointStyleIcon
                    style={selectedFrontEndpointStyle}
                    side="start"
                  />
                </span>
              }
            >
              {getEndpointStyleLabel(selectedFrontEndpointStyle)}
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
          contentStyle={ENDPOINT_MENU_CONTENT_STYLE}
          trigger={
            <MenuTrigger
              data-testid="connector-end-endpoint-trigger"
              className={menuTrigger}
              prefix={
                <span style={endpointIconPrefixStyle}>
                  <EndpointStyleIcon
                    style={selectedRearEndpointStyle}
                    side="end"
                  />
                </span>
              }
            >
              {getEndpointStyleLabel(selectedRearEndpointStyle)}
            </MenuTrigger>
          }
        />
      </SettingRow>
      <SettingRow
        name="Corner radius"
        desc={''}
        data-testid="connector-corner-radius-row"
      >
        <Slider
          data-testid="connector-corner-radius-slider"
          value={[cornerRadius]}
          onValueChange={setCornerRadius}
          min={4}
          max={36}
          step={4}
          nodes={[4, 12, 20, 28, 36]}
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
