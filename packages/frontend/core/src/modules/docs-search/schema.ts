import { defineSchema } from '@toeverything/infra';

export const docIndexSchema = defineSchema({
  title: 'FullText',
});

export type DocIndexSchema = typeof docIndexSchema;

export const blockIndexSchema = defineSchema({
  docId: 'String',
  blockId: 'String',
  content: 'FullText',
  flavour: 'String',
  ref: 'String',
  blob: 'String',
});

export type BlockIndexSchema = typeof blockIndexSchema;
