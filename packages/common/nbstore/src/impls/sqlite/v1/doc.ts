import { DummyConnection } from '../../../connection';
import {
  type DocRecord,
  DocStorageBase,
  type DocUpdate,
} from '../../../storage';
import { getIdConverter, type IdConverter } from '../../../utils/id-converter';
import { isEmptyUpdate } from '../../../utils/is-empty-update';
import type { SpaceType } from '../../../utils/universal-id';
import { apis } from './db';

/**
 * We use a fixed timestamp in v1 because the v1 should never be changed.
 * This date is chosen because it is large enough to overwrite some previous error data.
 * In our sync storage, only a larger timestamp can overwrite smaller one.
 */
const CONST_TIMESTAMP = new Date(1893456000000);

/**
 * @deprecated readonly
 */
export class SqliteV1DocStorage extends DocStorageBase<{
  type: SpaceType;
  id: string;
}> {
  static identifier = 'SqliteV1DocStorage';
  cachedIdConverter: Promise<IdConverter> | null = null;
  override connection = new DummyConnection();

  constructor(options: { type: SpaceType; id: string }) {
    super({ ...options, readonlyMode: true });
  }

  private get db() {
    if (!apis) {
      throw new Error('Not in electron context.');
    }

    return apis;
  }

  override async pushDocUpdate(update: DocUpdate) {
    // no more writes
    return { docId: update.docId, timestamp: CONST_TIMESTAMP };
  }

  override async getDoc(docId: string) {
    const idConverter = await this.getIdConverter();
    const bin = await this.db.getDocAsUpdates(
      this.options.type,
      this.options.id,
      idConverter.newIdToOldId(docId)
    );

    if (isEmptyUpdate(bin)) {
      return null;
    }

    return {
      docId,
      bin,
      timestamp: CONST_TIMESTAMP,
    };
  }

  override async getDocTimestamps() {
    const timestamps = await this.db.getDocTimestamps(
      this.options.type,
      this.options.id
    );

    if (!timestamps) {
      return {};
    }

    const idConverter = await this.getIdConverter();

    return timestamps.reduce(
      (ret, { docId }) => {
        ret[idConverter.oldIdToNewId(docId ?? this.options.id)] =
          CONST_TIMESTAMP;
        return ret;
      },
      {} as Record<string, Date>
    );
  }

  override async deleteDoc() {
    return;
  }

  protected override async getDocSnapshot() {
    return null;
  }

  override async getDocTimestamp() {
    return null;
  }

  protected override async setDocSnapshot(): Promise<boolean> {
    return false;
  }

  protected override async getDocUpdates(): Promise<DocRecord[]> {
    return [];
  }

  protected override async markUpdatesMerged(): Promise<number> {
    return 0;
  }

  private async getIdConverter() {
    if (this.cachedIdConverter) {
      return await this.cachedIdConverter;
    }
    this.cachedIdConverter = getIdConverter(
      {
        getDocBuffer: async id => {
          if (!this.db) {
            return null;
          }
          const updates = await this.db.getDocAsUpdates(
            this.options.type,
            this.options.id,
            id
          );

          if (isEmptyUpdate(updates)) {
            return null;
          }

          if (!updates) {
            return null;
          }

          return updates;
        },
      },
      this.spaceId
    );

    return await this.cachedIdConverter;
  }
}
