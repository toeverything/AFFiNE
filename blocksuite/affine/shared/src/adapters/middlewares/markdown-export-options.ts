import type { TransformerMiddleware } from '@blocksuite/store';

export const MARKDOWN_EXPORT_PRESERVE_IMAGE_URL_KEY =
  'markdownExportPreserveImageUrl';

export const markdownExportPreserveImageUrlMiddleware =
  (): TransformerMiddleware => {
    return ({ adapterConfigs }) => {
      adapterConfigs.set(MARKDOWN_EXPORT_PRESERVE_IMAGE_URL_KEY, 'true');
    };
  };
