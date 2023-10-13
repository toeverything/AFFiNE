import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { mkdirp, readJSON } from 'fs-extra';

interface SnapshotData {
  idbData: Record<string, any>;
  localStorageData: Record<string, string>;
  binaries: Record<string, number[]>;
}

interface BinaryIndexData {
  name: string;
  start: number;
  end: number;
}

export class SnapshotStorage {
  idbFilePath: string;
  localStorageFilePath: string;
  binaryIndexPath: string;
  binaryFilePath: string;

  constructor(version: string) {
    // The snapshots data is stored in "@affine-test/fixtures/legacy", just keep all fixtures in one place
    const legacyReadMeFilePath = require.resolve(
      '@affine-test/fixtures/legacy/README.md'
    );
    const dir = dirname(legacyReadMeFilePath);

    this.idbFilePath = join(dir, version, 'idb.json');
    this.binaryFilePath = join(dir, version, 'idb.bin');
    this.binaryIndexPath = join(dir, version, 'idb_index.json');
    this.localStorageFilePath = join(dir, version, 'local-storage.json');
  }

  async read(): Promise<SnapshotData> {
    const {
      idbFilePath,
      localStorageFilePath,
      binaryIndexPath,
      binaryFilePath,
    } = this;

    const [idbData, localStorageData, binaryIndexArr, binaryContent] =
      await Promise.all([
        readJSON(idbFilePath),
        readJSON(localStorageFilePath),
        readJSON(binaryIndexPath) as Promise<BinaryIndexData[]>,
        readFile(binaryFilePath),
      ]);

    const binaries: Record<string, number[]> = {};
    for (const index of binaryIndexArr) {
      const chunk = binaryContent.subarray(index.start, index.end);
      binaries[index.name] = Array.from(chunk);
    }

    return {
      binaries,
      idbData,
      localStorageData,
    };
  }

  async write(data: SnapshotData) {
    const {
      idbFilePath,
      localStorageFilePath,
      binaryIndexPath,
      binaryFilePath,
    } = this;
    const { idbData, localStorageData, binaries } = data;

    await mkdirp(dirname(idbFilePath));

    const binaryIndexData: BinaryIndexData[] = [];
    const binaryBuffers: Buffer[] = [];
    let currentIndex = 0;
    for (const [name, value] of Object.entries(binaries)) {
      const buffer = Buffer.from(value);
      const endIndex = currentIndex + buffer.length;

      binaryIndexData.push({
        name,
        start: currentIndex,
        end: endIndex,
      });
      binaryBuffers.push(buffer);

      currentIndex += buffer.length;
    }

    await Promise.all([
      writeFile(
        localStorageFilePath,
        JSON.stringify(localStorageData, null, 2),
        'utf-8'
      ),
      writeFile(idbFilePath, JSON.stringify(idbData, null, 2), 'utf-8'),
      writeFile(
        binaryIndexPath,
        JSON.stringify(binaryIndexData, null, 2),
        'utf-8'
      ),
      writeFile(binaryFilePath, Buffer.concat(binaryBuffers), 'utf-8'),
    ]);
  }
}
