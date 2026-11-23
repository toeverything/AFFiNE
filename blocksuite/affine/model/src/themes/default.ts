import type { Palette, Theme } from './types';
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
} as const;
