import crypto from 'node:crypto';

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

console.log('ECDSA Public Key:\n', publicKey);
console.log('ECDSA Private Key:\n', privateKey);
