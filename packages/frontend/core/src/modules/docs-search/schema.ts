import { defineSchema } from '@toeverything/infra';

export const docIndexSchema = defineSchema({
  title: 'FullText',
  // summary of the doc, used for preview
  summary: { type: 'String', index: false },
  journal: 'String',
});

export type DocIndexSchema = typeof docIndexSchema;

export const blockIndexSchema = defineSchema({
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
  // { "databaseName": "xxx" }
  additional: { type: 'String', index: false },
});

export type BlockIndexSchema = typeof blockIndexSchema;
