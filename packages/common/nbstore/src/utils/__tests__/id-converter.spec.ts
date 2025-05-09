import { beforeAll, describe, expect, it } from 'vitest';

import { getIdConverter, type IdConverter } from '../id-converter';

const workspaceId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const userId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const oldIds = [
  workspaceId,
  'abcdefg',
  `db$${workspaceId}$folder`,
  `db$${workspaceId}$docProperties`,
  `userdata$${userId}$${workspaceId}$favorite`,
];

const newIds = [`db$folder`, `db$docProperties`, `userdata$${userId}$favorite`];

let converter: IdConverter;

beforeAll(async () => {
  converter = await getIdConverter(
    {
      getDocBuffer: async () => null,
    },
    workspaceId
  );
});

describe('idConverter', async () => {
  it('should convert old id to new id', () => {
    expect(oldIds.map(id => converter.oldIdToNewId(id))).toMatchInlineSnapshot(`
      [
        "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "abcdefg",
        "db$folder",
        "db$docProperties",
        "userdata$bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb$favorite",
      ]
    `);
  });

  it('should convert new id to old id', () => {
    expect(newIds.map(id => converter.newIdToOldId(id))).toMatchInlineSnapshot(`
      [
        "db$aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa$folder",
        "db$aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa$docProperties",
        "userdata$bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb$aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa$favorite",
      ]
    `);
  });
});
