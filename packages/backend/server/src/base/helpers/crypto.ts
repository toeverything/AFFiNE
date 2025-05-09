import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  generateKeyPairSync,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

import { Injectable } from '@nestjs/common';
import {
  hash as hashPassword,
  verify as verifyPassword,
} from '@node-rs/argon2';

import { Config } from '../config';
import { OnEvent } from '../event';

const NONCE_LENGTH = 12;
const AUTH_TAG_LENGTH = 12;

function generatePrivateKey(): string {
  const { privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });

  const key = privateKey.export({
    type: 'sec1',
    format: 'pem',
  });

  return key.toString('utf8');
}

function readPrivateKey(privateKey: string) {
  return createPrivateKey({
    key: Buffer.from(privateKey),
    format: 'pem',
    type: 'sec1',
  })
    .export({
      format: 'pem',
      type: 'pkcs8',
    })
    .toString('utf8');
}

function readPublicKey(privateKey: string) {
  return createPublicKey({
    key: Buffer.from(privateKey),
  })
    .export({ format: 'pem', type: 'spki' })
    .toString('utf8');
}

@Injectable()
export class CryptoHelper {
  keyPair!: {
    publicKey: Buffer;
    privateKey: Buffer;
    sha256: {
      publicKey: Buffer;
      privateKey: Buffer;
    };
  };

  constructor(private readonly config: Config) {}

  @OnEvent('config.init')
  onConfigInit() {
    this.setup();
  }

  @OnEvent('config.changed')
  onConfigChanged(event: Events['config.changed']) {
    if (event.updates.crypto?.privateKey) {
      this.setup();
    }
  }

  private setup() {
    const key = this.config.crypto.privateKey || generatePrivateKey();
    const privateKey = readPrivateKey(key);
    const publicKey = readPublicKey(key);

    this.keyPair = {
      publicKey: Buffer.from(publicKey),
      privateKey: Buffer.from(privateKey),
      sha256: {
        publicKey: this.sha256(publicKey),
        privateKey: this.sha256(privateKey),
      },
    };
  }

  sign(data: string) {
    const sign = createSign('rsa-sha256');
    sign.update(data, 'utf-8');
    sign.end();
    return `${data},${sign.sign(this.keyPair.privateKey, 'base64')}`;
  }

  verify(signatureWithData: string) {
    const [data, signature] = signatureWithData.split(',');
    if (!signature) {
      return false;
    }
    const verify = createVerify('rsa-sha256');
    verify.update(data, 'utf-8');
    verify.end();
    return verify.verify(this.keyPair.privateKey, signature, 'base64');
  }

  encrypt(data: string) {
    const iv = this.randomBytes();
    const cipher = createCipheriv(
      'aes-256-gcm',
      this.keyPair.sha256.privateKey,
      iv,
      {
        authTagLength: AUTH_TAG_LENGTH,
      }
    );
    const encrypted = Buffer.concat([
      cipher.update(data, 'utf-8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  decrypt(encrypted: string) {
    const buf = Buffer.from(encrypted, 'base64');
    const iv = buf.subarray(0, NONCE_LENGTH);
    const authTag = buf.subarray(NONCE_LENGTH, NONCE_LENGTH + AUTH_TAG_LENGTH);
    const encryptedToken = buf.subarray(NONCE_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.keyPair.sha256.privateKey,
      iv,
      { authTagLength: AUTH_TAG_LENGTH }
    );
    decipher.setAuthTag(authTag);
    const decrepted = decipher.update(encryptedToken, void 0, 'utf8');
    return decrepted + decipher.final('utf8');
  }

  encryptPassword(password: string) {
    return hashPassword(password);
  }

  verifyPassword(password: string, hash: string) {
    return verifyPassword(hash, password);
  }

  compare(lhs: string, rhs: string) {
    if (lhs.length !== rhs.length) {
      return false;
    }

    return timingSafeEqual(Buffer.from(lhs), Buffer.from(rhs));
  }

  randomBytes(length = NONCE_LENGTH) {
    return randomBytes(length);
  }

  randomInt(min: number, max: number) {
    return randomInt(min, max);
  }

  otp(length = 6) {
    let otp = '';

    for (let i = 0; i < length; i++) {
      otp += this.randomInt(0, 9).toString();
    }

    return otp;
  }

  sha256(data: string) {
    return createHash('sha256').update(data).digest();
  }
}
