import { describe, expect, test } from 'vitest';

import {
  preflightWebFilesImport,
  preflightWebZipImport,
  WebImportLimitError,
} from './web-limits';

function zipDirectoryFile(names: string[]) {
  const chunks = names.map(name => {
    const nameBytes = new TextEncoder().encode(name);
    const header = new Uint8Array(46 + nameBytes.length);
    writeU32(header, 0, 0x02014b50);
    writeU32(header, 20, 1);
    writeU32(header, 24, 1);
    writeU16(header, 28, nameBytes.length);
    header.set(nameBytes, 46);
    return header;
  });
  return new File(chunks, 'import.zip', { type: 'application/zip' });
}

function writeU16(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
}

function writeU32(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
  bytes[offset + 2] = (value >> 16) & 0xff;
  bytes[offset + 3] = (value >> 24) & 0xff;
}

describe('preflightWebZipImport', () => {
  test('rejects nested zip before JS importer parsing', async () => {
    await expect(
      preflightWebZipImport(zipDirectoryFile(['entry.md', 'nested.zip']))
    ).rejects.toBeInstanceOf(WebImportLimitError);
  });

  test('rejects document count over web limit', async () => {
    await expect(
      preflightWebZipImport(zipDirectoryFile(['a.md', 'b.md']), {
        maxTotalBytes: 1024,
        maxEntryBytes: 1024,
        maxEntryCount: 10,
        maxNestedZipDepth: 0,
        maxDocumentCount: 1,
      })
    ).rejects.toBeInstanceOf(WebImportLimitError);
  });

  test('counts html pages as web import documents', async () => {
    await expect(
      preflightWebZipImport(zipDirectoryFile(['a.html', 'b.htm']), {
        maxTotalBytes: 1024,
        maxEntryBytes: 1024,
        maxEntryCount: 10,
        maxNestedZipDepth: 0,
        maxDocumentCount: 1,
      })
    ).rejects.toBeInstanceOf(WebImportLimitError);
  });

  test('allows small zip directory', async () => {
    await expect(
      preflightWebZipImport(zipDirectoryFile(['entry.md']), {
        maxTotalBytes: 1024,
        maxEntryBytes: 1024,
        maxEntryCount: 10,
        maxNestedZipDepth: 0,
        maxDocumentCount: 1,
      })
    ).resolves.toBeUndefined();
  });
});

describe('preflightWebFilesImport', () => {
  test('rejects directory import over web document limit', async () => {
    await expect(
      preflightWebFilesImport(
        [new File(['a'], 'a.md'), new File(['b'], 'b.md')],
        {
          maxTotalBytes: 1024,
          maxEntryBytes: 1024,
          maxEntryCount: 10,
          maxNestedZipDepth: 0,
          maxDocumentCount: 1,
        }
      )
    ).rejects.toBeInstanceOf(WebImportLimitError);
  });

  test('allows small directory import', async () => {
    await expect(
      preflightWebFilesImport([new File(['a'], 'a.md')], {
        maxTotalBytes: 1024,
        maxEntryBytes: 1024,
        maxEntryCount: 10,
        maxNestedZipDepth: 0,
        maxDocumentCount: 1,
      })
    ).resolves.toBeUndefined();
  });
});
