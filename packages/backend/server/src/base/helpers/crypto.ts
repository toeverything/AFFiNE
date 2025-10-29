import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  generateKeyPairSync,
  type KeyObject,
  randomBytes,
  randomInt,
  sign,
  timingSafeEqual,
  verify,
} from 'node:crypto';

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  hash as hashPassword,
  verify as verifyPassword,
} from '@node-rs/argon2';

import {
  AFFINE_PRO_LICENSE_AES_KEY,
  AFFINE_PRO_PUBLIC_KEY,
} from '../../native';
import { Config } from '../config';
import { OnEvent } from '../event';

const NONCE_LENGTH = 12;
const AUTH_TAG_LENGTH = 12;

function generatePrivateKey(): string {
  const { privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });

  // Export EC private key as PKCS#8 PEM. This avoids OpenSSL 3.x decoder issues
  // in Node.js 22 when later deriving the public key via createPublicKey.
  const key = privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });

  return key.toString('utf8');
}

function parseKey(privateKey: string) {
  const keyBuf = Buffer.from(privateKey);
  let priv: KeyObject;
  try {
    priv = createPrivateKey({ key: keyBuf, format: 'pem', type: 'pkcs8' });
  } catch (e1) {
    try {
      priv = createPrivateKey({ key: keyBuf, format: 'pem', type: 'sec1' });
    } catch (e2) {
      // As a last resort rely on auto-detection
      priv = createPrivateKey(keyBuf);
    }
  }
  const pub = createPublicKey(priv);
  return { priv, pub };
}

@Injectable()
export class CryptoHelper implements OnModuleInit {
  logger = new Logger(CryptoHelper.name);

  keyPair!: {
    publicKey: KeyObject;
    privateKey: KeyObject;
    sha256: {
      publicKey: Buffer;
      privateKey: Buffer;
    };
  };

  AFFiNEProPublicKey: Buffer | null = null;
  AFFiNEProLicenseAESKey: Buffer | null = null;

  onModuleInit() {
    if (env.selfhosted) {
      this.AFFiNEProPublicKey = this.loadAFFiNEProPublicKey();
      this.AFFiNEProLicenseAESKey = this.loadAFFiNEProLicenseAESKey();
    }
  }

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
    const privateKey = this.config.crypto.privateKey || generatePrivateKey();
    const { priv, pub } = parseKey(privateKey);
    const publicKey = pub
      .export({ format: 'pem', type: 'spki' })
      .toString('utf8');

    this.keyPair = {
      publicKey: pub,
      privateKey: priv,
      sha256: {
        publicKey: this.sha256(publicKey),
        privateKey: this.sha256(privateKey),
      },
    };
  }

  private get keyType() {
    return (this.keyPair.privateKey.asymmetricKeyType as string) || 'ec';
  }

  sign(data: string) {
    const input = Buffer.from(data, 'utf-8');
    if (this.keyType === 'ed25519') {
      // Ed25519 signs the message directly (no pre-hash)
      const sig = sign(null, input, this.keyPair.privateKey);
      return `${data},${sig.toString('base64')}`;
    } else {
      // ECDSA with SHA-256 for EC keys
      const sign = createSign('sha256');
      sign.update(input);
      sign.end();
      return `${data},${sign.sign(this.keyPair.privateKey, 'base64')}`;
    }
  }

  verify(signatureWithData: string) {
    const [data, signature] = signatureWithData.split(',');
    if (!signature) {
      return false;
    }
    const input = Buffer.from(data, 'utf-8');
    const sigBuf = Buffer.from(signature, 'base64');
    if (this.keyType === 'ed25519') {
      // Ed25519 verifies the message directly
      return verify(null, input, this.keyPair.publicKey, sigBuf);
    } else {
      // ECDSA with SHA-256
      const verify = createVerify('sha256');
      verify.update(input);
      verify.end();
      return verify.verify(this.keyPair.publicKey, sigBuf);
    }
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
      otp += this.randomInt(0, 10).toString();
    }

    return otp;
  }

  sha256(data: string) {
    return createHash('sha256').update(data).digest();
  }

  private loadAFFiNEProPublicKey() {
    if (AFFINE_PRO_PUBLIC_KEY) {
      return Buffer.from(AFFINE_PRO_PUBLIC_KEY);
    } else {
      this.logger.warn('AFFINE_PRO_PUBLIC_KEY is not set at compile time.');
    }

    if (!env.prod && process.env.AFFiNE_PRO_PUBLIC_KEY) {
      return Buffer.from(process.env.AFFiNE_PRO_PUBLIC_KEY);
    }

    return null;
  }

  private loadAFFiNEProLicenseAESKey() {
    if (AFFINE_PRO_LICENSE_AES_KEY) {
      return this.sha256(AFFINE_PRO_LICENSE_AES_KEY);
    } else {
      this.logger.warn(
        'AFFINE_PRO_LICENSE_AES_KEY is not set at compile time.'
      );
    }

    if (!env.prod && process.env.AFFiNE_PRO_LICENSE_AES_KEY) {
      return this.sha256(process.env.AFFiNE_PRO_LICENSE_AES_KEY);
    }

    return null;
  }
}
