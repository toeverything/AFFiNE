import { z } from 'zod';

import { ColorSchema } from './color';

export const PaletteSchema = z.object({
  key: z.string(),
  value: ColorSchema,
});

export type Palette = z.infer<typeof PaletteSchema>;

export const ThemeSchema = z.object({
  pureBlack: z.string(),
  pureWhite: z.string(),
  black: ColorSchema,
  white: ColorSchema,
  transparent: z.literal('transparent'),
  textColor: ColorSchema,
  shapeTextColor: ColorSchema,
  shapeStrokeColor: ColorSchema,
  shapeFillColor: ColorSchema,
  connectorColor: ColorSchema,
  noteBackgrounColor: ColorSchema,
  hightlighterColor: ColorSchema,

  // Universal color palettes
  Palettes: z.array(PaletteSchema),
  ShapeTextColorPalettes: z.array(PaletteSchema),
  NoteBackgroundColorMap: z.record(z.string(), ColorSchema),
  NoteBackgroundColorPalettes: z.array(PaletteSchema),

  // Usually used in global toolbar and editor preview
  StrokeColorShortMap: z.record(z.string(), ColorSchema),
  StrokeColorShortPalettes: z.array(PaletteSchema),
  FillColorShortMap: z.record(z.string(), ColorSchema),
  FillColorShortPalettes: z.array(PaletteSchema),
  ShapeTextColorShortMap: z.record(z.string(), ColorSchema),
  ShapeTextColorShortPalettes: z.array(PaletteSchema),
});

export type Theme = z.infer<typeof ThemeSchema>;
