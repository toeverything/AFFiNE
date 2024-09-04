import {
  BrushSchema,
  ConnectorSchema,
  EdgelessTextSchema,
  NoteSchema,
  ShapeSchema,
} from '@blocksuite/affine-shared/utils';
import { z } from 'zod';

// TODO import from BlockSuite
export const BSEditorSettingSchema = z.object({
  connector: ConnectorSchema,
  brush: BrushSchema,
  shape: ShapeSchema,
  'affine:edgeless-text': EdgelessTextSchema,
  'affine:note': NoteSchema,
});

export type FontFamily = 'Sans' | 'Serif' | 'Mono' | 'Custom';

export const fontStyleOptions = [
  { key: 'Sans', value: 'var(--affine-font-sans-family)' },
  { key: 'Serif', value: 'var(--affine-font-serif-family)' },
  { key: 'Mono', value: 'var(--affine-font-mono-family)' },
  { key: 'Custom', value: 'var(--affine-font-sans-family)' },
] satisfies {
  key: FontFamily;
  value: string;
}[];

const AffineEditorSettingSchema = z.object({
  enableAI: z.boolean().default(true),
  fontFamily: z.enum(['Sans', 'Serif', 'Mono', 'Custom']).default('Sans'),
  customFontFamily: z.string().default(''),
  newDocDefaultMode: z.enum(['edgeless', 'page']).default('page'),
  spellCheck: z.boolean().default(false),
  fullWidthLayout: z.boolean().default(false),
  displayDocInfo: z.boolean().default(true),
  displayBiDirectionalLink: z.boolean().default(true),
});

export const EditorSettingSchema = BSEditorSettingSchema.merge(
  AffineEditorSettingSchema
);

export type EditorSettingSchema = z.infer<typeof EditorSettingSchema>;
