import { GeneralSettingSchema } from '@blocksuite/affine/shared/services';
import { z } from 'zod';

export const BSEditorSettingSchema = GeneralSettingSchema;

export type FontFamily = 'Sans' | 'Serif' | 'Mono' | 'Custom';
export type EdgelessDefaultTheme = 'auto' | 'dark' | 'light' | 'specified';

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
  fontFamily: z.enum(['Sans', 'Serif', 'Mono', 'Custom']).default('Sans'),
  customFontFamily: z.string().default(''),
  fontSize: z.number().min(12).max(24).default(16),
  newDocDefaultMode: z.enum(['edgeless', 'page', 'ask']).default('page'),
  fullWidthLayout: z.boolean().default(false),
  displayDocInfo: z.boolean().default(true),
  displayBiDirectionalLink: z.boolean().default(true),
  edgelessDefaultTheme: z
    .enum(['specified', 'dark', 'light', 'auto'])
    .default('specified'),
  openDocMode: z
    .enum([
      'open-in-active-view',
      'open-in-new-view',
      'open-in-new-tab',
      'open-in-center-peek',
    ])
    .default('open-in-active-view'),
  // linux only:
  enableMiddleClickPaste: z.boolean().default(false),
});

export const EditorSettingSchema = BSEditorSettingSchema.merge(
  AffineEditorSettingSchema
);

// oxlint-disable-next-line no-redeclare
export type EditorSettingSchema = z.infer<typeof EditorSettingSchema>;
