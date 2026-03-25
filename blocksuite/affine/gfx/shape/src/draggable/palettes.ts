import {
  DefaultTheme,
  type LineWidth,
  type Palette,
  type StrokeStyle,
} from '@blocksuite/affine-model';

export type ShapePaletteStyle = {
  fill: Palette['value'];
  stroke: Palette['value'];
  strokeWidth?: LineWidth;
  strokeStyle?: StrokeStyle;
  ringColor?: Palette['value'];
  gradientFinal?: Palette['value'];
  gradientDirection?: 'S' | 'W' | 'N' | 'E' | 'SE' | 'SW' | 'NE' | 'NW';
};

export type ShapePalette = {
  id: string;
  styles: ShapePaletteStyle[];
};

export const shapePaletteKeys = DefaultTheme.FillColorShortPalettes.map(
  palette => palette.key
);

const ensureLength = (styles: ShapePaletteStyle[]) => {
  if (styles.length >= shapePaletteKeys.length) {
    return styles.slice(0, shapePaletteKeys.length);
  }
  const last = styles[styles.length - 1];
  return styles.concat(
    Array.from({ length: shapePaletteKeys.length - styles.length }, () => last)
  );
};

const getPaletteValueByKey = (palettes: Palette[], key: string) =>
  palettes.find(palette => palette.key === key)?.value;

const applyDefaultTail = (styles: ShapePaletteStyle[]) => {
  const blackFill = getPaletteValueByKey(
    DefaultTheme.FillColorShortPalettes,
    'Black'
  );
  const whiteFill = getPaletteValueByKey(
    DefaultTheme.FillColorShortPalettes,
    'White'
  );
  const transparentFill = getPaletteValueByKey(
    DefaultTheme.FillColorShortPalettes,
    'Transparent'
  );
  const blackStroke = getPaletteValueByKey(
    DefaultTheme.StrokeColorShortPalettes,
    'Black'
  );
  const transparentStroke = DefaultTheme.StrokeColorShortMap.Grey;

  const base = styles.slice();
  const tailStart = shapePaletteKeys.length - 3;
  if (tailStart >= 0) {
    base[tailStart] = {
      ...base[tailStart],
      fill: blackFill ?? base[tailStart].fill,
      stroke: blackStroke ?? base[tailStart].stroke,
      gradientFinal: undefined,
      gradientDirection: undefined,
    };
    base[tailStart + 1] = {
      ...base[tailStart + 1],
      fill: whiteFill ?? base[tailStart + 1].fill,
      stroke: blackStroke ?? base[tailStart + 1].stroke,
      ringColor: DefaultTheme.black,
      gradientFinal: undefined,
      gradientDirection: undefined,
    };
    base[tailStart + 2] = {
      ...base[tailStart + 2],
      fill: transparentFill ?? base[tailStart + 2].fill,
      stroke: transparentStroke,
      ringColor: transparentStroke,
      gradientFinal: undefined,
      gradientDirection: undefined,
    };
  }
  return base;
};

const affineStyles = applyDefaultTail(
  ensureLength(
    DefaultTheme.FillColorShortPalettes.map((palette, index) => ({
      fill: palette.value,
      stroke:
        DefaultTheme.StrokeColorShortPalettes[index]?.value ??
        DefaultTheme.StrokeColorShortMap.Grey,
    }))
  )
);

const dio0Styles = applyDefaultTail(
  ensureLength([
    { fill: '#f8cecc', stroke: '#b85450' },
    { fill: '#ffe6cc', stroke: '#d79b00' },
    { fill: '#fff2cc', stroke: '#d6b656' },
    { fill: '#d5e8d4', stroke: '#82b366' },
    { fill: '#dae8fc', stroke: '#6c8ebf' },
    { fill: '#e1d5e7', stroke: '#9673a6' },
    { fill: '#e6d0de', stroke: '#996185' },
    { fill: '#f5f5f5', stroke: '#666666' },
  ])
);

const dio1Styles = applyDefaultTail(
  ensureLength([
    { fill: '#60a917', stroke: '#2d7600' },
    { fill: '#008a00', stroke: '#005700' },
    { fill: '#1ba1e2', stroke: '#006eaf' },
    { fill: '#0050ef', stroke: '#001dbc' },
    { fill: '#6a00ff', stroke: '#3700cc' },
    { fill: '#d80073', stroke: '#a50040' },
    { fill: '#a20025', stroke: '#6f0000' },
    { fill: '#aa00ff', stroke: '#7700cc' },
  ])
);

const dio2Styles = applyDefaultTail(
  ensureLength([
    { fill: '#e51400', stroke: '#b20000' },
    { fill: '#fa6800', stroke: '#c73500' },
    { fill: '#f0a30a', stroke: '#bd7000' },
    { fill: '#e3c800', stroke: '#b09500' },
    { fill: '#6d8764', stroke: '#3a5431' },
    { fill: '#647687', stroke: '#314354' },
    { fill: '#76608a', stroke: '#432d57' },
    { fill: '#c8a27a', stroke: '#8a5a2b' },
  ])
);

const dio3Styles = applyDefaultTail(
  ensureLength([
    { fill: '#fad7ac', stroke: '#b46504' },
    { fill: '#fad9d5', stroke: '#ae4132' },
    { fill: '#b0e3e6', stroke: '#0e8088' },
    { fill: '#b1ddf0', stroke: '#10739e' },
    { fill: '#d0cee2', stroke: '#56517e' },
    { fill: '#bac8d3', stroke: '#23445d' },
    { fill: '#d0cee2', stroke: '#56517e' },
    { fill: '#b1ddf0', stroke: '#10739e' },
  ])
);

const dio4Styles = applyDefaultTail(
  ensureLength([
    {
      fill: '#f8cecc',
      stroke: '#b85450',
      gradientFinal: '#ea6b66',
      gradientDirection: 'S',
    },
    {
      fill: '#ffcd28',
      stroke: '#d79b00',
      gradientFinal: '#ffa500',
      gradientDirection: 'S',
    },
    {
      fill: '#fff2cc',
      stroke: '#d6b656',
      gradientFinal: '#ffd966',
      gradientDirection: 'S',
    },
    {
      fill: '#d5e8d4',
      stroke: '#82b366',
      gradientFinal: '#97d077',
      gradientDirection: 'S',
    },
    {
      fill: '#dae8fc',
      stroke: '#6c8ebf',
      gradientFinal: '#7ea6e0',
      gradientDirection: 'S',
    },
    {
      fill: '#e6d0de',
      stroke: '#996185',
      gradientFinal: '#d5739d',
      gradientDirection: 'S',
    },
    {
      fill: '#e1d5e7',
      stroke: '#9673a6',
      gradientFinal: '#b5739d',
      gradientDirection: 'S',
    },
    {
      fill: '#f5f5f5',
      stroke: '#666666',
      gradientFinal: '#b3b3b3',
      gradientDirection: 'S',
    },
  ])
);

const dio5Styles = applyDefaultTail(
  ensureLength([
    { fill: '#eeeeee', stroke: '#36393d' },
    { fill: '#f9f7ed', stroke: '#36393d' },
    { fill: '#ffcc99', stroke: '#36393d' },
    { fill: '#cce5ff', stroke: '#36393d' },
    { fill: '#ffff88', stroke: '#36393d' },
    { fill: '#cdeb8b', stroke: '#36393d' },
    { fill: '#ffcccc', stroke: '#36393d' },
    { fill: '#cce5ff', stroke: '#36393d' },
  ])
);

// Line style example
/**
const deepStyles = applyDefaultTail(
  ensureLength([
    { fill: '#EA6B66', stroke: '#EA6B66', strokeWidth: 3, strokeStyle: 'dash' },
    { fill: '#FFA500', stroke: '#FFA500', strokeWidth: 3, strokeStyle: 'dash' },
    { fill: '#FFD966', stroke: '#FFD966', strokeWidth: 3, strokeStyle: 'dash' },
    { fill: '#97D077', stroke: '#97D077', strokeWidth: 3, strokeStyle: 'dash' },
    { fill: '#67AB9F', stroke: '#67AB9F', strokeWidth: 3, strokeStyle: 'dash' },
    { fill: '#7EA6E0', stroke: '#7EA6E0', strokeWidth: 3, strokeStyle: 'dash' },
    { fill: '#8C6C9C', stroke: '#8C6C9C', strokeWidth: 3, strokeStyle: 'dash' },
    { fill: '#B5739D', stroke: '#B5739D', strokeWidth: 3, strokeStyle: 'dash' },
    { fill: '#B5739D', stroke: '#B5739D', strokeWidth: 3, strokeStyle: 'dash' },
    { fill: '#B5739D', stroke: '#B5739D', strokeWidth: 3, strokeStyle: 'dash' },
    { fill: '#B5739D', stroke: '#B5739D', strokeWidth: 3, strokeStyle: 'dash' },
  ])
);
**/

export const shapePalettes: ShapePalette[] = [
  {
    id: 'affine',
    styles: affineStyles,
  },
  {
    id: 'dio0',
    styles: dio0Styles,
  },
  {
    id: 'dio4',
    styles: dio4Styles,
  },
  {
    id: 'dio1',
    styles: dio1Styles,
  },
  {
    id: 'dio2',
    styles: dio2Styles,
  },
  {
    id: 'dio3',
    styles: dio3Styles,
  },
  {
    id: 'dio5',
    styles: dio5Styles,
  },
];

export function getShapePaletteData(index: number) {
  const palette = shapePalettes[index % shapePalettes.length];
  const stylesByKey = new Map(
    shapePaletteKeys.map((key, styleIndex) => [key, palette.styles[styleIndex]])
  );
  const fillPalettes = shapePaletteKeys.map((key, styleIndex) => ({
    key,
    value: palette.styles[styleIndex].fill,
  }));
  const strokePalettes = shapePaletteKeys.map((key, styleIndex) => ({
    key,
    value: palette.styles[styleIndex].stroke,
  }));
  const ringPalettes = shapePaletteKeys
    .map((key, styleIndex) => ({
      key,
      value: palette.styles[styleIndex].ringColor,
    }))
    .filter(item => item.value !== undefined) as Palette[];
  const gradientPalettes = shapePaletteKeys
    .map((key, styleIndex) => ({
      key,
      value: palette.styles[styleIndex].gradientFinal,
      direction: palette.styles[styleIndex].gradientDirection,
    }))
    .filter(item => item.value !== undefined) as {
    key: string;
    value: Palette['value'];
    direction?: ShapePaletteStyle['gradientDirection'];
  }[];

  return {
    palette,
    stylesByKey,
    fillPalettes,
    strokePalettes,
    ringPalettes,
    gradientPalettes,
  };
}
