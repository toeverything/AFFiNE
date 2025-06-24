import type { TransformerMiddleware } from '@blocksuite/store';
import { z } from 'zod';

export const CALLOUT_MARKDOWN_EXPORT_OPTIONS_KEY =
  'calloutMarkdownExportOptions';

export enum CalloutExportStyle {
  GFM = 'GFM',
  Admonitions = 'Admonitions',
}

export enum CalloutAdmonitionType {
  Info = 'info',
  Tip = 'tip',
  Warning = 'warning',
  Danger = 'danger',
  Details = 'details',
}

export const DEFAULT_ADMONITION_TYPE = CalloutAdmonitionType.Info;

export const CalloutAdmonitionTypeSet: Set<string> = new Set(
  Object.values(CalloutAdmonitionType)
);

export const calloutMarkdownExportOptionsSchema = z.object({
  style: z.nativeEnum(CalloutExportStyle),
  admonitionType: z.nativeEnum(CalloutAdmonitionType).optional(),
});
export type CalloutMarkdownExportOptions = z.infer<
  typeof calloutMarkdownExportOptionsSchema
>;

/**
 * Middleware to set the export style of the callout block
 * @param style - The markdown export style of the callout block
 * @returns A TransformerMiddleware that sets the markdown export style of the callout block
 */
export const calloutMarkdownExportMiddleware = (
  options: CalloutMarkdownExportOptions
): TransformerMiddleware => {
  return ({ adapterConfigs }) => {
    adapterConfigs.set(CALLOUT_MARKDOWN_EXPORT_OPTIONS_KEY, options);
  };
};
