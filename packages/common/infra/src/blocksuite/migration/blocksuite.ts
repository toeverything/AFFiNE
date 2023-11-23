import type { Schema } from '@blocksuite/store';
import type { Doc as YDoc } from 'yjs';
import { Map as YMap } from 'yjs';

const getLatestVersions = (schema: Schema): Record<string, number> => {
  return [...schema.flavourSchemaMap.entries()].reduce(
    (record, [flavour, schema]) => {
      record[flavour] = schema.version;
      return record;
    },
    {} as Record<string, number>
  );
};

export async function migratePages(
  rootDoc: YDoc,
  schema: Schema
): Promise<boolean> {
  const spaces = rootDoc.getMap('spaces') as YMap<any>;
  const meta = rootDoc.getMap('meta') as YMap<unknown>;
  const versions = meta.get('blockVersions') as YMap<number>;
  const oldVersions = versions?.toJSON() ?? {};
  spaces.forEach((space: YDoc) => {
    try {
      schema.upgradePage(0, oldVersions, space);
    } catch (e) {
      console.error(`page ${space.guid} upgrade failed`, e);
    }
  });

  const newVersions = getLatestVersions(schema);
  meta.set('blockVersions', new YMap(Object.entries(newVersions)));
  return Object.entries(oldVersions).some(
    ([flavour, version]) => newVersions[flavour] !== version
  );
}
