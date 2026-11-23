import { bench, describe } from 'vitest';

import { base64ToUint8Array, uint8ArrayToBase64 } from '../impls/cloud/socket';

const data = new Uint8Array(1024 * 256);
for (let i = 0; i < data.length; i++) {
  data[i] = i % 251;
}
let encoded = '';

await uint8ArrayToBase64(data).then(result => {
  encoded = result;
});

describe('base64 helpers', () => {
  bench('encode Uint8Array to base64', async () => {
    await uint8ArrayToBase64(data);
  });

  bench('decode base64 to Uint8Array', () => {
    base64ToUint8Array(encoded);
  });
});
