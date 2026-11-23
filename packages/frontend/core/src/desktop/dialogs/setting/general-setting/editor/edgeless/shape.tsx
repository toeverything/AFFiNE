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
  EdgelessCRUDIdentifier,
  getSurfaceBlock,
} from '@blocksuite/affine/blocks/surface';
import type { ShapeElementModel, ShapeName } from '@blocksuite/affine/model';
import {
  DefaultTheme,
  FontFamily,
  FontFamilyMap,
  FontStyle,
  FontWeightMap,
  getShapeName,
  ShapeStyle,
  ShapeType,
  StrokeStyle,
  TextAlign,
} from '@blocksuite/affine/model';
import type { EditorHost } from '@blocksuite/affine/std';
import type { Store } from '@blocksuite/affine/store';
import { useFramework, useLiveData } from '@toeverything/infra';
import { isEqual } from 'lodash-es';
import { useCallback, useMemo, useState } from 'react';

import { DropdownMenu } from '../menu';
import {
  menuTrigger,
  preViewLabelWrapper,
  settingWrapper,
  shapeIndicator,
} from '../style.css';
import { sortedFontWeightEntries, usePalettes } from '../utils';
import type { DocName } from './docs';
import { Point } from './point';
import { EdgelessSnapshot } from './snapshot';

enum ShapeTextFontSize {
  '16px' = '16',
  '20px' = '20',
  '24px' = '24',
  '32px' = '32',
  '40px' = '40',
  '64px' = '64',
}

export const ShapeSettings = () => {
  const t = useI18n();
  const framework = useFramework();
  const { editorSetting } = framework.get(EditorSettingService);
  const settings = useLiveData(editorSetting.settings$);
  const {
    palettes: strokeColorPalettes,
    getCurrentColor: getCurrentStrokeColor,
  } = usePalettes(
    DefaultTheme.StrokeColorShortPalettes,
    DefaultTheme.shapeStrokeColor
  );
  const { palettes: fillColorPalettes, getCurrentColor: getCurrentFillColor } =
    usePalettes(
      DefaultTheme.FillColorShortPalettes,
      DefaultTheme.shapeFillColor
    );
  const { palettes: textColorPalettes, getCurrentColor: getCurrentTextColor } =
    usePalettes(
      DefaultTheme.ShapeTextColorShortPalettes,
      DefaultTheme.shapeTextColor,
      true
    );

  const [currentShape, setCurrentShape] = useState<ShapeName>(ShapeType.Rect);

  const shapeStyleItems = useMemo<RadioItem[]>(
    () => [
      {
        value: ShapeStyle.General,
        label: t['com.affine.settings.editorSettings.edgeless.style.general'](),
      },
      {
        value: ShapeStyle.Scribbled,
        label:
          t['com.affine.settings.editorSettings.edgeless.style.scribbled'](),
      },
    ],
    [t]
  );

  const { shapeStyle } = settings[`shape:${currentShape}`];
  const setShapeStyle = useCallback(
    (value: ShapeStyle) => {
      editorSetting.set(`shape:${currentShape}`, {
        shapeStyle: value,
      });
    },
    [editorSetting, currentShape]
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

  const borderStyle = settings[`shape:${currentShape}`].strokeStyle;
  const setBorderStyle = useCallback(
    (value: StrokeStyle) => {
      editorSetting.set(`shape:${currentShape}`, {
        strokeStyle: value,
      });
    },
    [editorSetting, currentShape]
  );

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

  const textAlignment = settings[`shape:${currentShape}`].textAlign;
  const setTextAlignment = useCallback(
    (value: TextAlign) => {
      editorSetting.set(`shape:${currentShape}`, {
        textAlign: value,
      });
    },
    [editorSetting, currentShape]
  );

  const shapes = useMemo<RadioItem[]>(
    () => [
      {
        value: ShapeType.Rect,
        label: t['com.affine.settings.editorSettings.edgeless.shape.square'](),
      },
      {
        value: ShapeType.Ellipse,
        label: t['com.affine.settings.editorSettings.edgeless.shape.ellipse'](),
      },
      {
        value: ShapeType.Diamond,
        label: t['com.affine.settings.editorSettings.edgeless.shape.diamond'](),
      },
      {
        value: ShapeType.Triangle,
        label:
          t['com.affine.settings.editorSettings.edgeless.shape.triangle'](),
      },
      {
        value: 'roundedRect',
        label:
          t[
            'com.affine.settings.editorSettings.edgeless.shape.rounded-rectangle'
          ](),
      },
    ],
    [t]
  );

  const docs = useMemo<RadioItem[]>(
    () => [
      {
        value: 'shape',
        label: t['com.affine.settings.editorSettings.edgeless.shape.list'](),
      },
      {
        value: 'flow',
        label: t['com.affine.settings.editorSettings.edgeless.shape.flow'](),
      },
    ],
    [t]
  );
  const [currentDoc, setCurrentDoc] = useState<DocName>('shape');

  const fillColorItems = useMemo(() => {
    const { fillColor } = settings[`shape:${currentShape}`];
    return fillColorPalettes.map(({ key, value, resolvedValue }) => {
      const handler = () => {
        editorSetting.set(`shape:${currentShape}`, { fillColor: value });
      };
      const isSelected = isEqual(fillColor, value);
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
  }, [editorSetting, settings, currentShape, fillColorPalettes]);

  const strokeColorItems = useMemo(() => {
    const { strokeColor } = settings[`shape:${currentShape}`];
    return strokeColorPalettes.map(({ key, value, resolvedValue }) => {
      const handler = () => {
        editorSetting.set(`shape:${currentShape}`, { strokeColor: value });
      };
      const isSelected = isEqual(strokeColor, value);
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
  }, [editorSetting, settings, currentShape, strokeColorPalettes]);

  const borderThickness = settings[`shape:${currentShape}`].strokeWidth;
  const setBorderThickness = useCallback(
    (value: number[]) => {
      editorSetting.set(`shape:${currentShape}`, {
        strokeWidth: value[0],
      });
    },
    [editorSetting, currentShape]
  );

  const fontFamilyItems = useMemo(() => {
    const { fontFamily } = settings[`shape:${currentShape}`];
    return Object.entries(FontFamily).map(([name, value]) => {
      const handler = () => {
        editorSetting.set(`shape:${currentShape}`, { fontFamily: value });
      };
      const isSelected = fontFamily === value;
      return (
        <MenuItem key={name} onSelect={handler} selected={isSelected}>
          {name}
        </MenuItem>
      );
    });
  }, [editorSetting, settings, currentShape]);

  const fontStyleItems = useMemo(() => {
    const { fontStyle } = settings[`shape:${currentShape}`];
    return Object.entries(FontStyle).map(([name, value]) => {
      const handler = () => {
        editorSetting.set(`shape:${currentShape}`, { fontStyle: value });
      };
      const isSelected = fontStyle === value;
      return (
        <MenuItem key={name} onSelect={handler} selected={isSelected}>
          {name}
        </MenuItem>
      );
    });
  }, [editorSetting, settings, currentShape]);

  const fontWeightItems = useMemo(() => {
    const { fontWeight } = settings[`shape:${currentShape}`];
    return sortedFontWeightEntries.map(([name, value]) => {
      const handler = () => {
        editorSetting.set(`shape:${currentShape}`, { fontWeight: value });
      };
      const isSelected = fontWeight === value;
      return (
        <MenuItem key={name} onSelect={handler} selected={isSelected}>
          {name}
        </MenuItem>
      );
    });
  }, [editorSetting, settings, currentShape]);

  const fontSizeItems = useMemo(() => {
    const { fontSize } = settings[`shape:${currentShape}`];
    return Object.entries(ShapeTextFontSize).map(([name, value]) => {
      const handler = () => {
        editorSetting.set(`shape:${currentShape}`, { fontSize: Number(value) });
      };
      const isSelected = fontSize === Number(value);
      return (
        <MenuItem key={name} onSelect={handler} selected={isSelected}>
          {name}
        </MenuItem>
      );
    });
  }, [editorSetting, settings, currentShape]);

  const textColorItems = useMemo(() => {
    const { color } = settings[`shape:${currentShape}`];
    return textColorPalettes.map(({ key, value, resolvedValue }) => {
      const handler = () => {
        editorSetting.set(`shape:${currentShape}`, { color: value });
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
  }, [editorSetting, settings, currentShape, textColorPalettes]);

  const getElements = useCallback(
    (doc: Store) => {
      const surface = getSurfaceBlock(doc);
      if (!surface) return [];
      return surface.getElementsByType('shape').filter(node => {
        const shape = node as ShapeElementModel;
        const { shapeType, radius } = shape;
        const shapeName = getShapeName(shapeType, radius);
        return shapeName === currentShape;
      });
    },
    [currentShape]
  );

  const firstUpdate = useCallback(
    (doc: Store, editorHost: EditorHost) => {
      const surface = getSurfaceBlock(doc);
      if (!surface) return;
      const crud = editorHost.std.get(EdgelessCRUDIdentifier);
      doc.readonly = false;
      surface.getElementsByType('shape').forEach(node => {
        const shape = node as ShapeElementModel;
        const { shapeType, radius } = shape;
        const shapeName = getShapeName(shapeType, radius);
        const props = editorSetting.get(`shape:${shapeName}`);
        crud.updateElement(shape.id, props);
      });
      doc.readonly = true;
    },
    [editorSetting]
  );

  const fillColor = useMemo(() => {
    const color = settings[`shape:${currentShape}`].fillColor;
    return getCurrentFillColor(color);
  }, [currentShape, getCurrentFillColor, settings]);

  const strokeColor = useMemo(() => {
    const color = settings[`shape:${currentShape}`].strokeColor;
    return getCurrentStrokeColor(color);
  }, [currentShape, getCurrentStrokeColor, settings]);

  const textColor = useMemo(() => {
    const color = settings[`shape:${currentShape}`].color;
    return getCurrentTextColor(color);
  }, [currentShape, getCurrentTextColor, settings]);

  const height = currentDoc === 'flow' ? 456 : 180;
  return (
    <>
      <EdgelessSnapshot
        key={currentDoc}
        title={t['com.affine.settings.editorSettings.edgeless.shape']()}
        docName={currentDoc}
        keyName={`shape:${currentShape}`}
        height={height}
        getElements={getElements}
        firstUpdate={firstUpdate}
      >
        <RadioGroup
          value={currentDoc}
          items={docs}
          onChange={setCurrentDoc}
          style={{
            position: 'absolute',
            right: '10px',
            bottom: '10px',
          }}
          className={preViewLabelWrapper}
        />
      </EdgelessSnapshot>

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
        {fillColor ? (
          <DropdownMenu
            items={fillColorItems}
            trigger={
              <MenuTrigger
                className={menuTrigger}
                prefix={<Point color={fillColor.resolvedValue} />}
              >
                {fillColor.key}
              </MenuTrigger>
            }
          />
        ) : null}
      </SettingRow>
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.edgeless.shape.border-color'
        ]()}
        desc={''}
      >
        {strokeColor ? (
          <DropdownMenu
            items={strokeColorItems}
            trigger={
              <MenuTrigger
                className={menuTrigger}
                prefix={<Point color={strokeColor.resolvedValue} />}
              >
                {strokeColor.key}
              </MenuTrigger>
            }
          />
        ) : null}
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
              {FontFamilyMap[settings[`shape:${currentShape}`].fontFamily]}
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
              {settings[`shape:${currentShape}`].fontSize + 'px'}
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
              {settings[`shape:${currentShape}`].fontStyle}
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
              {FontWeightMap[settings[`shape:${currentShape}`].fontWeight]}
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
