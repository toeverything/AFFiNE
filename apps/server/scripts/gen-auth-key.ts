import crypto from 'node:crypto';

import { genSalt } from '@node-rs/bcrypt';

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem',
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
  },
});

console.log('Salt:\n', await genSalt(10));
console.log('ECDSA Public Key:\n', publicKey);
console.log('ECDSA Private Key:\n', privateKey);
