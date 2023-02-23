import { __unstableSchemas, builtInSchemas } from '@blocksuite/blocks/models';

import { BlockSuiteWorkspace } from '../shared';
import { apis } from '../shared/apis';

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

export const createEmptyBlockSuiteWorkspace = (room: string) => {
  return new BlockSuiteWorkspace({
    room,
    blobOptionsGetter: (k: string) =>
      // fixme: token could be expired
      ({ api: '/api/workspace', token: apis.auth.token }[k]),
  })
    .register(builtInSchemas)
    .register(__unstableSchemas);
};
