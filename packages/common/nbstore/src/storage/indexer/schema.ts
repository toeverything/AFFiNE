import type { IndexFieldType } from './field-type';

export const IndexerSchema = {
  doc: {
    docId: 'String',
    title: 'FullText',
    // summary of the doc, used for preview
    summary: { type: 'String', index: false },
  },
  block: {
    docId: 'String',
    blockId: 'String',
    content: 'FullText',
    flavour: 'String',
    blob: 'String',
    // reference doc id
    // ['xxx','yyy']
    refDocId: 'String',
    // reference info, used for backlink to specific block
    // [{"docId":"xxx","mode":"page","blockIds":["gt5Yfq1maYvgNgpi13rIq"]},{"docId":"yyy","mode":"edgeless","blockIds":["k5prpOlDF-9CzfatmO0W7"]}]
    ref: { type: 'String', index: false },
    // parent block flavour
    parentFlavour: 'String',
    // parent block id
    parentBlockId: 'String',
    // additional info
    // { "databaseName": "xxx", "displayMode": "page/edgeless", "noteBlockId": "xxx" }
    additional: { type: 'String', index: false },
    markdownPreview: { type: 'String', index: false },
  },
} satisfies Record<string, Record<string, IndexerFieldSchema>>;

export type IndexerFieldSchema =
  | IndexFieldType
  | {
      type: IndexFieldType;
      /**
       * If false, the field will not be indexed, and thus not searchable.
       *
       * default: true
       */
      index?: boolean;
      /**
       * If false, the field will not be stored, and not included in the search result.
       *
       * default: true
       */
      store?: boolean;
    };

export type IndexerSchema = typeof IndexerSchema;
