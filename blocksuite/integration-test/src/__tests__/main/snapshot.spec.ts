import type { SurfaceBlockModel } from '@blocksuite/affine/blocks/surface';
import { AffineSchemas } from '@blocksuite/affine/schemas';
import { ZipTransformer } from '@blocksuite/affine/widgets/linked-doc';
import type { PointLocation } from '@blocksuite/global/gfx';
import { Schema } from '@blocksuite/store';
import { beforeEach, expect, test } from 'vitest';

import { wait } from '../utils/common.js';
import { setupEditor } from '../utils/setup.js';

const excludes = new Set([
  'shape-textBound',
  'externalXYWH',
  'connector-text',
  'connector-labelXYWH',
]);

const fieldChecker: Record<string, (value: any) => boolean> = {
  'connector-path': (value: PointLocation[]) => {
    return value.length > 0;
  },
  xywh: (value: string) => {
    return value.match(xywhPattern) !== null;
  },
};

const skipFields = new Set(['_lastXYWH']);

const snapshotTest = async (snapshotUrl: string, elementsCount: number) => {
  const transformer = ZipTransformer;
  const schema = new Schema();
  schema.register(AffineSchemas);

  const snapshotFile = await fetch(snapshotUrl)
    .then(res => res.blob())
    .catch(e => {
      console.error(e);
      throw e;
    });

  const [newDoc] = await transformer.importDocs(
    window.editor.doc.workspace,
    schema,
    snapshotFile
  );

  if (!newDoc) {
    throw new Error('Failed to import snapshot');
  }

  editor.doc = newDoc;
  await wait();

  const surface = newDoc.getModelsByFlavour(
    'affine:surface'
  )[0] as SurfaceBlockModel;
  const surfaceElements = [...surface['_elementModels']].map(
    ([_, { model }]) => model
  );

  expect(surfaceElements.length).toBe(elementsCount);

  surfaceElements.forEach(element => {
    const type = element.type;

    for (const field in element) {
      const value = element[field as keyof typeof element];
      const typeField = `${type}-${field}`;

      if (excludes.has(`${type}-${field}`) || excludes.has(field)) {
        return;
      }

      if (skipFields.has(field)) {
        return;
      }

      if (fieldChecker[typeField] || fieldChecker[field]) {
        const checker = fieldChecker[typeField] || fieldChecker[field];
        expect(checker(value)).toBe(true);
        return;
      }

      expect(
        value,
        `type: ${element.type} field: "${field}"`
      ).not.toBeUndefined();
      expect(value, `type: ${element.type} field: "${field}"`).not.toBeNull();
      expect(value, `type: ${element.type} field: "${field}"`).not.toBeNaN();
    }
  });
};

beforeEach(async () => {
  const cleanup = await setupEditor('page');

  return cleanup;
});

const xywhPattern = /\[(\s*-?\d+(\.\d+)?\s*,){3}(\s*-?\d+(\.\d+)?\s*)\]/;

test('snapshot 1 importing', async () => {
  await snapshotTest('https://test.affineassets.com/test-snapshot-1.zip', 25);
});

test('snapshot 2 importing', async () => {
  await snapshotTest(
    'https://test.affineassets.com/test-snapshot-2%20(onboarding).zip',
    174
  );
});
