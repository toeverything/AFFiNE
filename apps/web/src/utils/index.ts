import { __unstableSchemas, builtInSchemas } from '@blocksuite/blocks/models';
import type { BlobOptionsGetter } from '@blocksuite/store';

import { BlockSuiteWorkspace } from '../shared';

export function stringToColour(str: string) {
  str = str || 'affine';
  let colour = '#';
  let hash = 0;
  // str to hash
  for (
    let i = 0;
    i < str.length;
    hash = str.charCodeAt(i++) + ((hash << 5) - hash)
  );

  // int/hash to hex
  for (
    let i = 0;
    i < 3;
    colour += ('00' + ((hash >> (i++ * 8)) & 0xff).toString(16)).slice(-2)
  );

  return colour;
}

const hashMap = new Map<string, BlockSuiteWorkspace>();
export const createEmptyBlockSuiteWorkspace = (
  room: string,
  blobOptionsGetter?: BlobOptionsGetter
): BlockSuiteWorkspace => {
  if (hashMap.has(room)) {
    return hashMap.get(room) as BlockSuiteWorkspace;
  }
  const workspace = new BlockSuiteWorkspace({
    room,
    isSSR: typeof window === 'undefined',
    blobOptionsGetter,
  })
    .register(builtInSchemas)
    .register(__unstableSchemas);
  hashMap.set(room, workspace);
  return workspace;
};
