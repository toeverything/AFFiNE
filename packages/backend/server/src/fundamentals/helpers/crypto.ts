import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createSign,
  createVerify,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import { Injectable } from '@nestjs/common';
import {
  hash as hashPassword,
  verify as verifyPassword,
} from '@node-rs/argon2';

import { Config } from '../config';

const NONCE_LENGTH = 12;
const AUTH_TAG_LENGTH = 12;

@Injectable()
export class CryptoHelper {
  keyPair: {
    publicKey: Buffer;
    privateKey: Buffer;
    sha256: {
      publicKey: Buffer;
      privateKey: Buffer;
    };
  };

  constructor(config: Config) {
    this.keyPair = {
      publicKey: Buffer.from(config.crypto.secret.publicKey, 'utf8'),
      privateKey: Buffer.from(config.crypto.secret.privateKey, 'utf8'),
      sha256: {
        publicKey: this.sha256(config.crypto.secret.publicKey),
        privateKey: this.sha256(config.crypto.secret.privateKey),
      },
    };
  }

  sign(data: string) {
    const sign = createSign('rsa-sha256');
    sign.update(data, 'utf-8');
    sign.end();
    return sign.sign(this.keyPair.privateKey, 'base64');
  }

  verify(data: string, signature: string) {
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

  sha256(data: string) {
    return createHash('sha256').update(data).digest();
  }
}
