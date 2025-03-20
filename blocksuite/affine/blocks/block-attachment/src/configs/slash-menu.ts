import { FileSizeLimitService } from '@blocksuite/affine-shared/services';
import { openFileOrFiles } from '@blocksuite/affine-shared/utils';
import { type SlashMenuConfig } from '@blocksuite/affine-widget-slash-menu';
import { ExportToPdfIcon, FileIcon } from '@blocksuite/icons/lit';

import { addSiblingAttachmentBlocks } from '../utils';
import { AttachmentTooltip, PDFTooltip } from './tooltips';

export const attachmentSlashMenuConfig: SlashMenuConfig = {
  items: [
    {
      name: 'Attachment',
      description: 'Attach a file to document.',
      icon: FileIcon(),
      tooltip: {
        figure: AttachmentTooltip,
        caption: 'Attachment',
      },
      searchAlias: ['file'],
      group: '4_Content & Media@3',
      when: ({ model }) =>
        model.doc.schema.flavourSchemaMap.has('affine:attachment'),
      action: ({ std, model }) => {
        (async () => {
          const file = await openFileOrFiles();
          if (!file) return;
          const maxFileSize = std.store.get(FileSizeLimitService).maxFileSize;
          await addSiblingAttachmentBlocks(
            std.host,
            [file],
            maxFileSize,
            model,
            'after'
          );
          if (model.text?.length === 0) {
            std.store.deleteBlock(model);
          }
        })().catch(console.error);
      },
    },
    {
      name: 'PDF',
      description: 'Upload a PDF to document.',
      icon: ExportToPdfIcon(),
      tooltip: {
        figure: PDFTooltip,
        caption: 'PDF',
      },
      group: '4_Content & Media@4',
      when: ({ model }) =>
        model.doc.schema.flavourSchemaMap.has('affine:attachment'),
      action: ({ std, model }) => {
        (async () => {
          const file = await openFileOrFiles();
          if (!file) return;

          const maxFileSize = std.store.get(FileSizeLimitService).maxFileSize;

          await addSiblingAttachmentBlocks(
            std.host,
            [file],
            maxFileSize,
            model,
            'after'
          );
          if (model.text?.length === 0) {
            std.store.deleteBlock(model);
          }
        })().catch(console.error);
      },
    },
  ],
};
