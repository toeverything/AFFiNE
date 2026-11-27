import { describe, expect, test } from 'vitest';

import { importFilesAsDocs } from './file-import';

function unreadableFile(name: string) {
  const file = new File(['# unreadable'], name);
  Object.defineProperty(file, 'arrayBuffer', {
    value: () =>
      Promise.reject(new DOMException('Permission denied', 'SecurityError')),
  });
  return file;
}

describe('importFilesAsDocs', () => {
  test.each([
    {
      name: 'imports every converted file without warnings',
      files: [new File(['# a'], 'a.md'), new File(['# b'], 'b.md')],
      failingNames: [],
      docIds: ['doc:a.md', 'doc:b.md'],
      warnings: [],
    },
    {
      name: 'reports files the importer could not convert',
      files: [new File(['# a'], 'a.md'), new File(['# b'], 'b.md')],
      failingNames: ['b.md'],
      docIds: ['doc:a.md'],
      warnings: [{ code: 'skipped_doc', sourcePath: 'b.md' }],
    },
    {
      name: 'reports files that cannot be read',
      files: [new File(['# a'], 'a.md'), unreadableFile('b.md')],
      failingNames: [],
      docIds: ['doc:a.md'],
      warnings: [{ code: 'file-unreadable', sourcePath: 'b.md' }],
    },
  ])('$name', async ({ files, failingNames, docIds, warnings }) => {
    const result = await importFilesAsDocs(files, async file =>
      failingNames.includes(file.name) ? undefined : `doc:${file.name}`
    );

    expect(result.docIds).toEqual(docIds);
    expect(result.warnings).toEqual(
      warnings.map(warning => expect.objectContaining(warning))
    );
  });
});
