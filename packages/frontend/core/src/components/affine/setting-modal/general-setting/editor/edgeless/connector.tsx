import {
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
  ConnectorMode,
  LineColor,
  LineColorMap,
  PointStyle,
  StrokeStyle,
} from '@blocksuite/blocks';
import { useFramework, useLiveData } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import { DropdownMenu } from '../menu';
import { menuTrigger, settingWrapper } from '../style.css';
import { useColor } from '../utils';
import { Point } from './point';
import { EdgelessSnapshot } from './snapshot';

enum ConnecterStyle {
  General = 'general',
  Scribbled = 'scribbled',
}

export const ConnectorSettings = () => {
  const t = useI18n();
  const framework = useFramework();
  const { editorSetting } = framework.get(EditorSettingService);
  const settings = useLiveData(editorSetting.settings$);
  const getColorFromMap = useColor();

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
    return getColorFromMap(color, LineColorMap);
  }, [getColorFromMap, settings.connector.stroke]);

  const colorItems = useMemo(() => {
    const { stroke } = settings.connector;
    return Object.entries(LineColor).map(([name, value]) => {
      const handler = () => {
        editorSetting.set('connector', { stroke: value });
      };
      const isSelected = stroke === value;
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

  return (
    <>
      <EdgelessSnapshot
        title={t['com.affine.settings.editorSettings.edgeless.connecter']()}
        docName="connector"
        keyName="connector"
        flavour="connector"
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
                prefix={<Point color={currentColor.value} />}
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
    </>
  );
};
