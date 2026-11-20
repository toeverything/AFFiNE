import { z } from 'zod';

import { GRADIENT_DIRECTIONS, StrokeStyle } from '../consts/index';
import { ColorSchema } from './color';

export const PaletteSchema = z.object({
  key: z.string(),
  value: ColorSchema,
});

export type Palette = z.infer<typeof PaletteSchema>;

export const ShapePaletteStyleSchema = z.object({
  fill: ColorSchema,
  stroke: ColorSchema,
  strokeWidth: z.number().optional(),
  strokeStyle: z.nativeEnum(StrokeStyle).optional(),
  ringColor: ColorSchema.optional(),
  gradientFinal: ColorSchema.optional(),
  gradientDirection: z.enum(GRADIENT_DIRECTIONS).optional(),
});

export type ShapePaletteStyle = z.infer<typeof ShapePaletteStyleSchema>;

export const ShapePaletteSchema = z.object({
  id: z.string(),
  showInLine: z.boolean().optional(),
  showInFill: z.boolean().optional(),
  styles: z.array(ShapePaletteStyleSchema),
});

export type ShapePalette = z.infer<typeof ShapePaletteSchema>;

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

  // Shape/pen/connector palette presets
  ShapePalettes: z.array(ShapePaletteSchema),
});

export type Theme = z.infer<typeof ThemeSchema>;
