import type { Palette, ShapePalette, ShapePaletteStyle, Theme } from './types';
import { buildPalettes, getColorByKey, pureBlack, pureWhite } from './utils';

const Transparent = 'transparent';
const White = getColorByKey('edgeless/palette/white');
const Black = getColorByKey('edgeless/palette/black');

const Light = {
  Red: getColorByKey('edgeless/palette/light/redLight'),
  Orange: getColorByKey('edgeless/palette/light/orangeLight'),
  Yellow: getColorByKey('edgeless/palette/light/yellowLight'),
  Green: getColorByKey('edgeless/palette/light/greenLight'),
  Blue: getColorByKey('edgeless/palette/light/blueLight'),
  Purple: getColorByKey('edgeless/palette/light/purpleLight'),
  Magenta: getColorByKey('edgeless/palette/light/magentaLight'),
  Grey: getColorByKey('edgeless/palette/light/greyLight'),
} as const;

const Medium = {
  Red: getColorByKey('edgeless/palette/medium/redMedium'),
  Orange: getColorByKey('edgeless/palette/medium/orangeMedium'),
  Yellow: getColorByKey('edgeless/palette/medium/yellowMedium'),
  Green: getColorByKey('edgeless/palette/medium/greenMedium'),
  Blue: getColorByKey('edgeless/palette/medium/blueMedium'),
  Purple: getColorByKey('edgeless/palette/medium/purpleMedium'),
  Magenta: getColorByKey('edgeless/palette/medium/magentaMedium'),
  Grey: getColorByKey('edgeless/palette/medium/greyMedium'),
} as const;

const Heavy = {
  Red: getColorByKey('edgeless/palette/heavy/red'),
  Orange: getColorByKey('edgeless/palette/heavy/orange'),
  Yellow: getColorByKey('edgeless/palette/heavy/yellow'),
  Green: getColorByKey('edgeless/palette/heavy/green'),
  Blue: getColorByKey('edgeless/palette/heavy/blue'),
  Purple: getColorByKey('edgeless/palette/heavy/purple'),
  Magenta: getColorByKey('edgeless/palette/heavy/magenta'),
} as const;

const NoteBackgroundColorMap = {
  Red: getColorByKey('edgeless/note/red'),
  Orange: getColorByKey('edgeless/note/orange'),
  Yellow: getColorByKey('edgeless/note/yellow'),
  Green: getColorByKey('edgeless/note/green'),
  Blue: getColorByKey('edgeless/note/blue'),
  Purple: getColorByKey('edgeless/note/purple'),
  Magenta: getColorByKey('edgeless/note/magenta'),
  White: getColorByKey('edgeless/note/white'),
  Transparent: Transparent,
} as const;

const Palettes: Palette[] = [
  // Light
  ...buildPalettes(Light, 'Light'),

  { key: 'Transparent', value: Transparent },

  // Medium
  ...buildPalettes(Medium, 'Medium'),

  { key: 'White', value: White },

  // Heavy
  ...buildPalettes(Heavy, 'Heavy'),

  { key: 'Black', value: Black },
] as const;

const NoteBackgroundColorPalettes: Palette[] = [
  ...buildPalettes(NoteBackgroundColorMap),
] as const;

const StrokeColorShortMap = { ...Medium, Black, White } as const;

const StrokeColorShortPalettes: Palette[] = [
  ...buildPalettes(StrokeColorShortMap),
] as const;

const FillColorShortMap = { ...Medium, Black, White, Transparent } as const;

const FillColorShortPalettes: Palette[] = [
  ...buildPalettes(FillColorShortMap),
] as const;

const ShapeTextColorShortMap = {
  ...Medium,
  Black: pureBlack,
  White: pureWhite,
} as const;

const ShapeTextColorShortPalettes: Palette[] = [
  ...buildPalettes({ ...ShapeTextColorShortMap }),
] as const;

const ShapeTextColorPalettes: Palette[] = [
  // Light
  ...buildPalettes(Light, 'Light'),

  { key: 'Transparent', value: Transparent },

  // Medium
  ...buildPalettes(Medium, 'Medium'),

  { key: 'White', value: pureWhite },

  // Heavy
  ...buildPalettes(Heavy, 'Heavy'),

  { key: 'Black', value: pureBlack },
] as const;

const shapePaletteTail: ShapePaletteStyle[] = [
  {
    fill: White,
    stroke: White,
    ringColor: Medium.Grey,
  },
  {
    fill: Black,
    stroke: Black,
    ringColor: White,
  },
  {
    fill: Transparent,
    stroke: Medium.Grey,
    ringColor: Medium.Grey,
  },
];

const withShapePaletteTail = (styles: ShapePaletteStyle[]) => [
  ...styles,
  ...shapePaletteTail,
];

const ShapePalettes: ShapePalette[] = [
  {
    id: 'affine',
    showInLine: true,
    showInFill: true,
    styles: withShapePaletteTail(
      FillColorShortPalettes.slice(0, 8).map((palette, index) => ({
        fill: palette.value,
        stroke:
          StrokeColorShortPalettes[index]?.value ?? StrokeColorShortMap.Grey,
      }))
    ),
  },
  {
    id: 'material-light',
    showInLine: true,
    showInFill: true,
    styles: withShapePaletteTail([
      { fill: '#f8cecc', stroke: '#b85450' },
      { fill: '#ffe6cc', stroke: '#d79b00' },
      { fill: '#fff2cc', stroke: '#d6b656' },
      { fill: '#d5e8d4', stroke: '#82b366' },
      { fill: '#dae8fc', stroke: '#6c8ebf' },
      { fill: '#e1d5e7', stroke: '#9673a6' },
      { fill: '#e6d0de', stroke: '#996185' },
      { fill: '#f5f5f5', stroke: '#666666' },
    ]),
  },
  {
    id: 'material-gradient',
    showInLine: false,
    showInFill: true,
    styles: withShapePaletteTail([
      {
        fill: '#f8cecc',
        stroke: '#b85450',
        gradientFinal: '#e36863',
        gradientDirection: 'S',
      },
      {
        fill: '#FFE6CC',
        stroke: '#d79b00',
        gradientFinal: '#FFB940',
        gradientDirection: 'S',
      },
      {
        fill: '#FFF2CC',
        stroke: '#d6b656',
        gradientFinal: '#FADD4B',
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
        gradientFinal: '#88B4F2',
        gradientDirection: 'S',
      },
      {
        fill: '#e6d0de',
        stroke: '#996185',
        gradientFinal: '#D5739D',
        gradientDirection: 'S',
      },
      {
        fill: '#F5DFF5',
        stroke: '#994D96',
        gradientFinal: '#FAA0F4',
        gradientDirection: 'S',
      },
      {
        fill: '#f5f5f5',
        stroke: '#666666',
        gradientFinal: '#b3b3b3',
        gradientDirection: 'S',
      },
    ]),
  },
  {
    id: 'bold',
    showInLine: true,
    showInFill: true,
    styles: withShapePaletteTail([
      { fill: '#a20025', stroke: '#6f0000' },
      { fill: '#d80073', stroke: '#a50040' },
      { fill: '#6a00ff', stroke: '#3700cc' },
      { fill: '#0050ef', stroke: '#001dbc' },
      { fill: '#1ba1e2', stroke: '#006eaf' },
      { fill: '#008a00', stroke: '#005700' },
      { fill: '#60a917', stroke: '#2d7600' },
      { fill: '#FFDE3B', stroke: '#B09929' },
    ]),
  },
  {
    id: 'muted',
    showInLine: true,
    showInFill: true,
    styles: withShapePaletteTail([
      { fill: '#e51400', stroke: '#b20000' },
      { fill: '#fa6800', stroke: '#c73500' },
      { fill: '#f0a30a', stroke: '#bd7000' },
      { fill: '#e3c800', stroke: '#b09500' },
      { fill: '#6d8764', stroke: '#3a5431' },
      { fill: '#647687', stroke: '#314354' },
      { fill: '#76608a', stroke: '#432d57' },
      { fill: '#A0522D', stroke: '#6D1F00' },
    ]),
  },
];

export const DefaultTheme: Theme = {
  pureBlack,
  pureWhite,
  black: Black,
  white: White,
  transparent: Transparent,
  textColor: Black,
  shapeTextColor: pureBlack,
  shapeStrokeColor: Medium.Yellow,
  shapeFillColor: Medium.Yellow,
  connectorColor: Medium.Grey,
  noteBackgrounColor: NoteBackgroundColorMap.White,
  // 30% transparent `Medium.Blue`
  hightlighterColor: '#84cfff4d',
  Palettes,
  ShapeTextColorPalettes,
  NoteBackgroundColorMap,
  NoteBackgroundColorPalettes,
  StrokeColorShortMap,
  StrokeColorShortPalettes,
  FillColorShortMap,
  FillColorShortPalettes,
  ShapeTextColorShortMap,
  ShapeTextColorShortPalettes,
  ShapePalettes,
} as const;
