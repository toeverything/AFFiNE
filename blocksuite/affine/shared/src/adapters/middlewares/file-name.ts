import type { TransformerMiddleware } from '@blocksuite/store';

export const fileNameMiddleware =
  (fileName?: string): TransformerMiddleware =>
  ({ slots }) => {
    slots.beforeImport.subscribe(payload => {
      if (payload.type !== 'page') {
        return;
      }
      if (!fileName) {
        return;
      }
      payload.snapshot.meta.title = fileName;
      payload.snapshot.blocks.props.title = {
        '$blocksuite:internal:text$': true,
        delta: [
          {
            insert: fileName,
          },
        ],
      };
    });
  };
