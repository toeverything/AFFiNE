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
  const whiteStroke = getPaletteValueByKey(
    DefaultTheme.StrokeColorShortPalettes,
    'White'
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
      stroke: whiteStroke ?? base[tailStart + 1].stroke,
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

const fancyStyles = applyDefaultTail(
  ensureLength([
    { fill: '#F8CECC', stroke: '#B85450' },
    { fill: '#FFCD28', stroke: '#D79B00' },
    { fill: '#FFF2CC', stroke: '#D6B656' },
    { fill: '#D5E8D4', stroke: '#82B366' },
    { fill: '#D5E8D4', stroke: '#6A9153' },
    { fill: '#DAE8FC', stroke: '#6C8EBF' },
    { fill: '#E1D5E7', stroke: '#9673A6' },
    { fill: '#E6D0DE', stroke: '#996185' },
    { fill: '#E6D0DE', stroke: '#996185' },
    { fill: '#E6D0DE', stroke: '#996185' },
    { fill: '#E6D0DE', stroke: '#996185' },
  ])
);

const gradientStyles = applyDefaultTail(
  ensureLength([
    {
      fill: '#F8CECC',
      stroke: '#B85450',
      gradientFinal: '#EA6B66',
      gradientDirection: 'S',
    },
    {
      fill: '#FFCD28',
      stroke: '#D79B00',
      gradientFinal: '#FFA500',
      gradientDirection: 'S',
    },
    {
      fill: '#FFF2CC',
      stroke: '#D6B656',
      gradientFinal: '#FFD966',
      gradientDirection: 'S',
    },
    {
      fill: '#D5E8D4',
      stroke: '#82B366',
      gradientFinal: '#97D077',
      gradientDirection: 'S',
    },
    {
      fill: '#D5E8D4',
      stroke: '#6A9153',
      gradientFinal: '#67AB9F',
      gradientDirection: 'S',
    },
    {
      fill: '#DAE8FC',
      stroke: '#6C8EBF',
      gradientFinal: '#7EA6E0',
      gradientDirection: 'S',
    },
    {
      fill: '#E1D5E7',
      stroke: '#9673A6',
      gradientFinal: '#8C6C9C',
      gradientDirection: 'S',
    },
    {
      fill: '#E6D0DE',
      stroke: '#996185',
      gradientFinal: '#B5739D',
      gradientDirection: 'S',
    },
    {
      fill: '#E6D0DE',
      stroke: '#996185',
      gradientFinal: '#B5739D',
      gradientDirection: 'S',
    },
    {
      fill: '#E6D0DE',
      stroke: '#996185',
      gradientFinal: '#B5739D',
      gradientDirection: 'S',
    },
    {
      fill: '#E6D0DE',
      stroke: '#996185',
      gradientFinal: '#B5739D',
      gradientDirection: 'S',
    },
  ])
);

const boldStyles = applyDefaultTail(
  ensureLength([
    { fill: '#EA6B66', stroke: '#B85450' },
    { fill: '#FFA500', stroke: '#D79B00' },
    { fill: '#FFD966', stroke: '#D6B656' },
    { fill: '#97D077', stroke: '#82B366' },
    { fill: '#67AB9F', stroke: '#6A9153' },
    { fill: '#7EA6E0', stroke: '#6C8EBF' },
    { fill: '#8C6C9C', stroke: '#9673A6' },
    { fill: '#B5739D', stroke: '#996185' },
    { fill: '#B5739D', stroke: '#996185' },
    { fill: '#B5739D', stroke: '#996185' },
    { fill: '#B5739D', stroke: '#996185' },
  ])
);

const outlineStyles = applyDefaultTail(
  ensureLength([
    { fill: '#F8CECC', stroke: '#EA6B66' },
    { fill: '#FFCD28', stroke: '#FFA500' },
    { fill: '#FFF2CC', stroke: '#FFD966' },
    { fill: '#D5E8D4', stroke: '#97D077' },
    { fill: '#D5E8D4', stroke: '#67AB9F' },
    { fill: '#DAE8FC', stroke: '#7EA6E0' },
    { fill: '#E1D5E7', stroke: '#8C6C9C' },
    { fill: '#E6D0DE', stroke: '#B5739D' },
    { fill: '#E6D0DE', stroke: '#B5739D' },
    { fill: '#E6D0DE', stroke: '#B5739D' },
    { fill: '#E6D0DE', stroke: '#B5739D' },
  ])
);

const solidStyles = applyDefaultTail(
  ensureLength([
    { fill: '#B85450', stroke: '#B85450' },
    { fill: '#D79B00', stroke: '#D79B00' },
    { fill: '#D6B656', stroke: '#D6B656' },
    { fill: '#82B366', stroke: '#82B366' },
    { fill: '#6A9153', stroke: '#6A9153' },
    { fill: '#6C8EBF', stroke: '#6C8EBF' },
    { fill: '#9673A6', stroke: '#9673A6' },
    { fill: '#996185', stroke: '#996185' },
    { fill: '#996185', stroke: '#996185' },
    { fill: '#996185', stroke: '#996185' },
    { fill: '#996185', stroke: '#996185' },
  ])
);

const softStyles = applyDefaultTail(
  ensureLength([
    { fill: '#F8CECC', stroke: '#F8CECC' },
    { fill: '#FFCD28', stroke: '#FFCD28' },
    { fill: '#FFF2CC', stroke: '#FFF2CC' },
    { fill: '#D5E8D4', stroke: '#D5E8D4' },
    { fill: '#D5E8D4', stroke: '#D5E8D4' },
    { fill: '#DAE8FC', stroke: '#DAE8FC' },
    { fill: '#E1D5E7', stroke: '#E1D5E7' },
    { fill: '#E6D0DE', stroke: '#E6D0DE' },
    { fill: '#E6D0DE', stroke: '#E6D0DE' },
    { fill: '#E6D0DE', stroke: '#E6D0DE' },
    { fill: '#E6D0DE', stroke: '#E6D0DE' },
  ])
);

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

export const shapePalettes: ShapePalette[] = [
  {
    id: 'affine',
    styles: affineStyles,
  },
  {
    id: 'fancy',
    styles: fancyStyles,
  },
  {
    id: 'gradient',
    styles: gradientStyles,
  },
  {
    id: 'bold',
    styles: boldStyles,
  },
  {
    id: 'outline',
    styles: outlineStyles,
  },
  {
    id: 'solid',
    styles: solidStyles,
  },
  {
    id: 'soft',
    styles: softStyles,
  },
  {
    id: 'deep',
    styles: deepStyles,
  },
];
